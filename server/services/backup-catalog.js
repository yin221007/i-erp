import {
  lstat,
  readFile,
  readdir,
  realpath
} from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const BACKUP_ID_PATTERN =
  /^\d{8}T\d{6}Z-(daily|upgrade|manual|pre-restore)$/;
const REQUIRED_FILES = [
  'complete',
  'metadata.json',
  'database.sql.gz',
  'uploads.tar.gz',
  'table-counts.tsv',
  'manifest.sha256'
];

function isContained(root, candidate) {
  return candidate.startsWith(`${root}${path.sep}`);
}

function parseBackupId(id) {
  const match = BACKUP_ID_PATTERN.exec(id);
  return match ? { id, kind: match[1] } : null;
}

function parseMetadata(source, expected) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    return { issue: 'invalid:metadata.json' };
  }

  const createdAt = new Date(value?.createdAt);
  if (
    value?.id !== expected.id ||
    value?.kind !== expected.kind ||
    value?.status !== 'complete' ||
    !Number.isSafeInteger(value?.sizeBytes) ||
    value.sizeBytes < 0 ||
    !Number.isSafeInteger(value?.uploadFileCount) ||
    value.uploadFileCount < 0 ||
    Number.isNaN(createdAt.getTime())
  ) {
    return { issue: 'invalid:metadata.json' };
  }

  return {
    metadata: {
      createdAt: createdAt.toISOString(),
      sizeBytes: value.sizeBytes,
      uploadFileCount: value.uploadFileCount
    }
  };
}

function isManifestStructurallyValid(source) {
  const lines = source.trim().split('\n');
  return (
    lines.length > 0 &&
    lines.every(line =>
      /^[a-f0-9]{64}  (?:\.\/)?[A-Za-z0-9._-]+$/.test(line)
    )
  );
}

async function isRegularFile(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function hasValidRestoreDrill(directory, manifestSource) {
  const markerPath = path.join(directory, 'restore-drill.ok');
  if (!(await isRegularFile(markerPath))) return false;

  const expectedDigest = createHash('sha256')
    .update(manifestSource)
    .digest('hex');
  const marker = await readFile(markerPath, 'utf8');
  return (
    marker.split(/\r?\n/).includes('status=success') &&
    marker.split(/\r?\n/).includes(`manifest_sha256=${expectedDigest}`)
  );
}

export function createBackupCatalog({ backupRoot }) {
  if (!path.isAbsolute(backupRoot || '')) {
    throw new Error('backupRoot must be an absolute path');
  }

  return {
    async list() {
      const rootStat = await lstat(backupRoot);
      if (rootStat.isSymbolicLink()) {
        throw new Error('Backup root must not be a symbolic link');
      }
      if (!rootStat.isDirectory()) {
        throw new Error('Backup root must be a directory');
      }

      const resolvedRoot = await realpath(backupRoot);
      const entries = await readdir(resolvedRoot, { withFileTypes: true });
      const backups = [];

      for (const entry of entries) {
        const parsedId = parseBackupId(entry.name);
        if (!parsedId || !entry.isDirectory() || entry.isSymbolicLink()) {
          continue;
        }

        const directory = path.join(resolvedRoot, entry.name);
        const resolvedDirectory = await realpath(directory);
        if (!isContained(resolvedRoot, resolvedDirectory)) continue;

        const issues = [];
        for (const file of REQUIRED_FILES) {
          if (!(await isRegularFile(path.join(resolvedDirectory, file)))) {
            issues.push(`missing:${file}`);
          }
        }

        let metadata = null;
        if (!issues.includes('missing:metadata.json')) {
          const parsedMetadata = parseMetadata(
            await readFile(path.join(resolvedDirectory, 'metadata.json'), 'utf8'),
            parsedId
          );
          metadata = parsedMetadata.metadata || null;
          if (parsedMetadata.issue) issues.push(parsedMetadata.issue);
        }

        let manifestSource = '';
        if (!issues.includes('missing:manifest.sha256')) {
          manifestSource = await readFile(
            path.join(resolvedDirectory, 'manifest.sha256'),
            'utf8'
          );
          if (!isManifestStructurallyValid(manifestSource)) {
            issues.push('invalid:manifest.sha256');
          }
        }

        const locked = await isRegularFile(path.join(resolvedDirectory, 'locked'));
        const restoreDrillVerified =
          issues.length === 0 &&
          (await hasValidRestoreDrill(resolvedDirectory, manifestSource));

        backups.push({
          id: parsedId.id,
          kind: parsedId.kind,
          status: issues.length === 0 ? 'complete' : 'invalid',
          createdAt: metadata?.createdAt || null,
          sizeBytes: metadata?.sizeBytes || 0,
          uploadFileCount: metadata?.uploadFileCount || 0,
          locked,
          restoreDrillVerified,
          selectable: issues.length === 0,
          issues
        });
      }

      return backups.sort((left, right) => {
        const leftTime = Date.parse(left.createdAt || '') || 0;
        const rightTime = Date.parse(right.createdAt || '') || 0;
        return rightTime - leftTime || right.id.localeCompare(left.id);
      });
    }
  };
}
