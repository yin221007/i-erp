import {
  readFile,
  readdir,
  rm,
  stat
} from 'node:fs/promises';
import path from 'node:path';
import { selectBackupsToDelete } from '../server/services/backup.js';

const backupRoot = path.resolve(process.argv[2] || process.env.BACKUP_ROOT || '');
if (!backupRoot || backupRoot === path.parse(backupRoot).root) {
  throw new Error('A non-root backup directory is required');
}

const capacityBytes = Number(
  process.env.BACKUP_CAPACITY_BYTES || 500 * 1024 ** 3
);
const entries = await readdir(backupRoot, { withFileTypes: true });
const backups = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const directory = path.join(backupRoot, entry.name);
  try {
    const metadata = JSON.parse(
      await readFile(path.join(directory, 'metadata.json'), 'utf8')
    );
    await stat(path.join(directory, 'complete'));
    backups.push({
      ...metadata,
      id: entry.name,
      locked: await stat(path.join(directory, 'locked'))
        .then(() => true)
        .catch(() => false)
    });
  } catch {
    backups.push({
      id: entry.name,
      kind: 'daily',
      status: 'incomplete',
      sizeBytes: 0,
      locked: false,
      createdAt: new Date(0).toISOString()
    });
  }
}

const result = selectBackupsToDelete(backups, {
  dailyRetention: 7,
  upgradeRetention: 3,
  capacityBytes,
  requiredBytes: 0
});

if (result.refused) {
  console.error(result.reason);
  process.exitCode = 78;
} else {
  for (const id of result.deleteIds) {
    const target = path.resolve(backupRoot, id);
    if (path.dirname(target) !== backupRoot) {
      throw new Error(`Refusing to delete path outside backup root: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
    console.log(`Deleted expired backup: ${id}`);
  }
}
