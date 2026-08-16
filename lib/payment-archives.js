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

function attachmentFileType(attachment) {
  const extension = String(attachment?.name || '').split('.').pop();
  if (extension && extension !== attachment?.name) return extension.toUpperCase();

  const mimeSubtype = String(attachment?.type || '').split('/').pop();
  return mimeSubtype ? mimeSubtype.toUpperCase() : 'FILE';
}

function projectInvoiceAttachments(project) {
  if (!project) return [];

  return (project.nodes || []).flatMap(node =>
    (node.attachments || [])
      .filter(attachment =>
        attachment.category === 'Invoice' ||
        /发票|开票|票据|invoice/i.test(
          `${attachment.name || ''} ${attachment.type || ''}`
        )
      )
      .map(attachment => ({
        id: attachment.id,
        title: String(attachment.name || '流程发票附件').replace(/\.[^.]+$/, ''),
        category: 'Invoice',
        projectId: project.id,
        projectName: project.name,
        fileType: attachmentFileType(attachment),
        size: attachment.size || '',
        uploadDate: attachment.uploadDate || '',
        createdAt: attachment.uploadDate || '',
        uploader: project.manager || '历史数据',
        url: attachment.url
      }))
  );
}

export function getInvoiceArchives(payment, projects, archives) {
  const project = resolvePaymentProject(payment, projects);
  const stableProjectId = payment.projectId || project?.id;
  const projectNames = [payment.projectName, project?.name].filter(Boolean);

  const matchedArchives = archives
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
    });

  // 兼容旧数据：历史流程附件可能已挂在项目节点，却没有生成正式档案。
  // 正式档案优先，并按 ID 或文件 URL 去重，避免同一发票重复展示。
  const seenIds = new Set(matchedArchives.map(archive => archive.id).filter(Boolean));
  const seenUrls = new Set(matchedArchives.map(archive => archive.url).filter(Boolean));
  const legacyAttachments = projectInvoiceAttachments(project).filter(attachment => {
    if (seenIds.has(attachment.id)) return false;
    if (attachment.url && seenUrls.has(attachment.url)) return false;
    seenIds.add(attachment.id);
    if (attachment.url) seenUrls.add(attachment.url);
    return true;
  });

  return [...matchedArchives, ...legacyAttachments]
    .sort((left, right) => {
      const leftTime = new Date(left.uploadDate || left.createdAt || 0).getTime();
      const rightTime = new Date(right.uploadDate || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}
