const PROJECT_SUFFIXES = [
  '厨房设备采购安装',
  '厨房设备',
  '设备采购安装',
  '采购安装',
  '厨房改造',
  '工程项目',
  '建设项目',
  '厨房',
  '工程',
  '项目'
];

export function normalizeProjectText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]《》<>·,，.。:：;；、_\-—]/g, '');
}

function stripProjectSuffixes(value) {
  let result = value;
  let changed = true;

  while (changed) {
    changed = false;
    for (const suffix of PROJECT_SUFFIXES) {
      if (result.length > suffix.length + 2 && result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }

  return result;
}

function projectNameKeys(value) {
  const normalized = normalizeProjectText(value);
  const stripped = stripProjectSuffixes(normalized);
  const keys = new Set([normalized, stripped].filter(Boolean));

  for (const candidate of [...keys]) {
    for (let index = 2; index <= Math.min(4, candidate.length - 1); index += 1) {
      if (/[市区县]/.test(candidate[index])) {
        keys.add(`${candidate.slice(0, index)}${candidate.slice(index + 1)}`);
      }
    }
  }

  return keys;
}

function namesAreAliases(left, right) {
  const leftKeys = projectNameKeys(left);
  const rightKeys = projectNameKeys(right);
  return [...leftKeys].some(key => rightKeys.has(key));
}

export function resolvePaymentProject(payment, projects) {
  if (payment.projectId) {
    const idMatch = projects.find(project => project.id === payment.projectId);
    if (idMatch) return idMatch;
  }

  const normalizedPaymentName = normalizeProjectText(payment.projectName);
  const exactMatches = projects.filter(
    project => normalizeProjectText(project.name) === normalizedPaymentName
  );
  if (exactMatches.length === 1) return exactMatches[0];

  const aliasMatches = projects.filter(project =>
    namesAreAliases(project.name, payment.projectName)
  );
  return aliasMatches.length === 1 ? aliasMatches[0] : undefined;
}

export function isInvoiceArchive(archive) {
  return archive.category === 'Invoice' ||
    /发票|开票|票据|invoice/i.test(
      `${archive.title || ''} ${archive.projectName || ''} ${archive.fileType || ''}`
    );
}

export function getInvoiceArchives(payment, projects, archives) {
  const project = resolvePaymentProject(payment, projects);
  const stableProjectId = payment.projectId || project?.id;
  const projectNames = [payment.projectName, project?.name].filter(Boolean);

  return archives
    .filter(isInvoiceArchive)
    .filter(archive => {
      if (stableProjectId && archive.projectId) {
        return archive.projectId === stableProjectId;
      }
      if (projectNames.some(name => namesAreAliases(archive.projectName, name))) return true;

      const archiveTitle = normalizeProjectText(archive.title);
      return projectNames.some(name =>
        [...projectNameKeys(name)].some(key => key.length >= 4 && archiveTitle.includes(key))
      );
    })
    .sort((left, right) => {
      const leftTime = new Date(left.uploadDate || left.createdAt || 0).getTime();
      const rightTime = new Date(right.uploadDate || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}
