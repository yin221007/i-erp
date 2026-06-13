import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createMaintenanceQueue } from '../server/services/maintenance-jobs.js';

const UUID_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

async function main() {
  const [command, requestedPath] = process.argv.slice(2);
  if (command !== 'verify-and-consume') {
    throw new Error('Unsupported maintenance job command');
  }

  const queueRoot = process.env.MAINTENANCE_QUEUE_ROOT;
  const secret = process.env.MAINTENANCE_JOB_SECRET;
  if (!path.isAbsolute(queueRoot || '') || !secret) {
    throw new Error('Maintenance job verification is not configured');
  }
  if (
    !path.isAbsolute(requestedPath || '') ||
    !UUID_FILE_PATTERN.test(path.basename(requestedPath))
  ) {
    throw new Error('Maintenance job path is invalid');
  }

  const runningRoot = await realpath(path.join(queueRoot, 'running'));
  const jobPath = await realpath(requestedPath);
  if (path.dirname(jobPath) !== runningRoot) {
    throw new Error('Maintenance job is outside the running queue');
  }
  const jobStat = await lstat(jobPath);
  if (!jobStat.isFile() || jobStat.isSymbolicLink()) {
    throw new Error('Maintenance job must be a regular file');
  }

  const job = JSON.parse(await readFile(jobPath, 'utf8'));
  const queue = createMaintenanceQueue({ queueRoot, secret });
  await queue.verifyAndConsume(job);
  process.stdout.write(
    `${job.id}\t${job.operation}\t${job.backupId || ''}\n`
  );
}

main().catch(() => {
  console.error('Maintenance job verification failed');
  process.exitCode = 65;
});
