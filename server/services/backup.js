function compareOldestFirst(left, right) {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function compareNewestFirst(left, right) {
  return compareOldestFirst(right, left);
}

function validateOptions(options) {
  for (const name of [
    'dailyRetention',
    'upgradeRetention',
    'manualRetention',
    'capacityBytes',
    'requiredBytes'
  ]) {
    if (!Number.isFinite(options[name]) || options[name] < 0) {
      throw new Error(`${name} must be a non-negative number`);
    }
  }
}

export function selectBackupsToDelete(backups, options) {
  validateOptions(options);
  const selected = new Set();

  for (const backup of backups) {
    if (backup.status !== 'complete' && !backup.locked) {
      selected.add(backup.id);
    }
  }

  const selectOutsideRetention = (kind, retention) => {
    const candidates = backups
      .filter(
        backup =>
          backup.status === 'complete' &&
          backup.kind === kind &&
          !backup.locked
      )
      .sort(compareNewestFirst);

    for (const backup of candidates.slice(retention)) {
      selected.add(backup.id);
    }
  };

  selectOutsideRetention('daily', options.dailyRetention);
  selectOutsideRetention('upgrade', options.upgradeRetention);
  selectOutsideRetention('manual', options.manualRetention);

  const remainingSize = () =>
    backups
      .filter(backup => !selected.has(backup.id))
      .reduce((total, backup) => total + backup.sizeBytes, 0);

  let projectedSize = remainingSize() + options.requiredBytes;
  if (projectedSize > options.capacityBytes) {
    const capacityCandidates = backups
      .filter(
        backup =>
          backup.status === 'complete' &&
          !backup.locked &&
          !selected.has(backup.id)
      )
      .sort(compareOldestFirst);

    for (const backup of capacityCandidates) {
      selected.add(backup.id);
      projectedSize -= backup.sizeBytes;
      if (projectedSize <= options.capacityBytes) break;
    }
  }

  if (projectedSize > options.capacityBytes) {
    return {
      refused: true,
      reason: 'Backup capacity limit would be exceeded',
      deleteIds: []
    };
  }

  const deleteIds = backups
    .filter(backup => selected.has(backup.id))
    .sort(compareOldestFirst)
    .map(backup => backup.id);

  return { refused: false, deleteIds };
}
