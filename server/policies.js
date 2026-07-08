const EXECUTIVE_DEPARTMENTS = new Set(['总经办', '财务部']);
const PROJECT_WRITE_DEPARTMENTS = new Set(['总经办', '销售部', '工程部']);
const PRODUCTION_WRITE_DEPARTMENTS = new Set(['总经办', '工程部', '生产部']);
const MONEY_WRITE_DEPARTMENTS = new Set(['总经办', '财务部', '销售部', '工程部']);

const OWNER_SCOPED_RESOURCES = new Set(['clients', 'equipment', 'docs']);

const RESOURCE_DEFINITIONS = Object.freeze({
  projects: Object.freeze({ read: 'scoped', write: 'scoped' }),
  clients: Object.freeze({ read: 'scoped', write: 'scoped' }),
  equipment: Object.freeze({ read: 'scoped', write: 'scoped' }),
  schedule: Object.freeze({ read: 'scoped', write: 'scoped' }),
  docs: Object.freeze({ read: 'scoped', write: 'scoped' }),
  archives: Object.freeze({ read: 'scoped', write: 'scoped' }),
  production: Object.freeze({ read: 'scoped', write: 'scoped' }),
  users: Object.freeze({ read: 'authenticated', write: 'admin' }),
  settings: Object.freeze({ read: 'authenticated', write: 'admin' }),
  payments: Object.freeze({ read: 'scoped', write: 'scoped' }),
  approvals: Object.freeze({ read: 'approval', write: 'approval' }),
  worklogs: Object.freeze({ read: 'scoped', write: 'owner_or_manager' }),
  messages: Object.freeze({ read: 'channel', write: 'channel' }),
  channels: Object.freeze({ read: 'channel', write: 'channel' }),
  email_configs: Object.freeze({ read: 'owner', write: 'owner' }),
  announcements: Object.freeze({ read: 'channel', write: 'channel' }),
  ai_messages: Object.freeze({ read: 'owner', write: 'owner' }),
  recycle_bin: Object.freeze({ read: 'admin', write: 'admin' })
});

export const RESOURCE_NAMES = Object.freeze(Object.keys(RESOURCE_DEFINITIONS));

function isAdministrator(user) {
  return user?.isDefaultAdmin === true || user?.role === 'Admin';
}

function isExecutive(user) {
  return EXECUTIVE_DEPARTMENTS.has(user?.department || '');
}

function isGlobalUser(user) {
  return isAdministrator(user) || isExecutive(user);
}

function hasReadWrite(user) {
  return user?.permission === 'ReadWrite';
}

function isDepartmentManager(user) {
  return user?.role === 'DeptManager';
}

function isOwnedRecord(resource, user, record) {
  if (!user || !record) return false;
  if (resource === 'email_configs') return record.id === user.id;
  return record.userId === user.id;
}

function contextUsers(context) {
  return Array.isArray(context?.users) ? context.users : [];
}

function contextProjects(context) {
  return Array.isArray(context?.projects) ? context.projects : [];
}

function contextChannels(context) {
  return Array.isArray(context?.channels) ? context.channels : [];
}

function sameDepartmentNicknames(user, context) {
  const names = new Set([user?.nickname].filter(Boolean));
  for (const item of contextUsers(context)) {
    if (item.department === user?.department && item.nickname) names.add(item.nickname);
  }
  return names;
}

function getContextUserById(id, context) {
  if (!id) return null;
  return contextUsers(context).find(item => item.id === id) || null;
}

function canSeeOwnerScopedRecord(user, record, context) {
  if (!user || !record) return false;
  if (isGlobalUser(user)) return true;
  if (record.creatorId === user.id || record.userId === user.id) return true;
  if (record.creatorName === user.nickname || record.uploader === user.nickname) return true;
  if (!isDepartmentManager(user)) return false;

  const owner = getContextUserById(record.creatorId || record.userId, context);
  if (owner?.department === user.department) return true;
  const names = sameDepartmentNicknames(user, context);
  return names.has(record.creatorName) || names.has(record.uploader);
}

function canWriteOwnerScopedRecord(user, record, context) {
  return hasReadWrite(user) && canSeeOwnerScopedRecord(user, record, context);
}

function canSeeClientRecord(user, record, context) {
  if (!user || !record) return false;
  if (isGlobalUser(user)) return true;
  if (['销售部'].includes(user.department || '')) return true;
  return canSeeOwnerScopedRecord(user, record, context);
}

function canWriteClientRecord(user, record, context) {
  return hasReadWrite(user) && canSeeClientRecord(user, record, context);
}

function getProjectByRecord(record, context) {
  if (!record) return null;
  const projects = contextProjects(context);
  return projects.find(project => {
    if (record.projectId && project.id === record.projectId) return true;
    if (record.id && project.id === record.id && record.items) return true;
    if (record.projectName && project.name === record.projectName) return true;
    return false;
  }) || null;
}

function canSeeProject(user, project, context) {
  if (!user || !project) return false;
  if (isGlobalUser(user)) return true;
  if (project.manager === user.nickname) return true;
  return isDepartmentManager(user) && sameDepartmentNicknames(user, context).has(project.manager);
}

function canSeeProjectRecord(user, record, context) {
  if (!user || !record) return false;
  if (isGlobalUser(user)) return true;
  const project = getProjectByRecord(record, context);
  if (project) return canSeeProject(user, project, context);
  if (record.manager === user.nickname || record.managerName === user.nickname) return true;
  if (record.creatorId === user.id || record.userId === user.id || record.uploader === user.nickname || record.assignee === user.nickname) return true;
  if (isDepartmentManager(user)) {
    const names = sameDepartmentNicknames(user, context);
    return names.has(record.manager) || names.has(record.managerName) || names.has(record.assignee) || names.has(record.uploader);
  }
  return false;
}

function channelParticipants(record) {
  return Array.isArray(record?.participants) ? record.participants : [];
}

function getChannel(record, context) {
  if (!record) return null;
  if (record.type && Array.isArray(record.participants)) return record;
  return contextChannels(context).find(channel => channel.id === record.channelId) || null;
}

function canSeeChannelRecord(user, record, context) {
  if (!user || !record) return false;
  if (isGlobalUser(user)) return true;
  const channel = getChannel(record, context);
  if (!channel) return record.userId === user.id || record.creatorId === user.id;
  if (channel.type === 'General') return true;
  if (channelParticipants(channel).includes(user.id)) return true;
  if (channel.projectId) return canSeeProjectRecord(user, { projectId: channel.projectId }, context);
  return false;
}

function canSeeApproval(user, approval) {
  if (!user || !approval) return false;
  if (isGlobalUser(user)) return true;
  if (approval.applicantId === user.id) return true;
  if (Array.isArray(approval.approverIds) && approval.approverIds.includes(user.id)) return true;
  return approval.versions?.some(version => version.outcomes?.some(outcome => outcome.approverId === user.id)) === true;
}

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function approvalVersions(approval) {
  return Array.isArray(approval?.versions) ? approval.versions : [];
}

function latestApprovalOutcomes(approval) {
  return approvalVersions(approval)[0]?.outcomes || [];
}

function isCleanApprovalSubmission(approval) {
  const versions = approvalVersions(approval);
  if (versions.length === 0) return true;
  return Array.isArray(versions[0]?.outcomes) && versions[0].outcomes.length === 0;
}

function pendingApprovalIds(approval) {
  if (approval?.status !== 'Pending') return [];
  const approverIds = Array.isArray(approval.approverIds) ? approval.approverIds : [];
  const signedIds = new Set(latestApprovalOutcomes(approval).map(outcome => outcome.approverId));
  if (approval.strategy === 'SEQUENTIAL') {
    const nextId = approverIds.find(id => !signedIds.has(id));
    return nextId ? [nextId] : [];
  }
  return approverIds.filter(id => !signedIds.has(id));
}

function expectedApprovalStatus(approval, outcomes, latestStatus) {
  if (latestStatus === 'Rejected') return 'Rejected';
  if (latestStatus === 'Returned') return 'Returned';
  if (approval.strategy === 'OR_SIGN') return 'Approved';
  const approvedIds = new Set(
    outcomes
      .filter(outcome => outcome.status === 'Approved')
      .map(outcome => outcome.approverId)
  );
  const approverIds = Array.isArray(approval.approverIds) ? approval.approverIds : [];
  return approverIds.length > 0 && approverIds.every(id => approvedIds.has(id))
    ? 'Approved'
    : 'Pending';
}

function isApprovalCreateAllowed(user, record) {
  if (!hasReadWrite(user)) return false;
  if (record?.applicantId !== user.id) return false;
  if (!['Draft', 'Pending'].includes(record?.status)) return false;
  if (!Array.isArray(record?.approverIds) || record.approverIds.length === 0) return false;
  return isCleanApprovalSubmission(record);
}

function isApprovalDeleteAllowed(user, record) {
  if (!hasReadWrite(user)) return false;
  if (record?.applicantId !== user.id) return false;
  return ['Draft', 'Returned'].includes(record?.status);
}

function canApplicantUpdateApproval(user, nextRecord, previousRecord) {
  if (!hasReadWrite(user)) return false;
  if (previousRecord?.applicantId !== user.id || nextRecord?.applicantId !== user.id) return false;
  if (!['Draft', 'Returned'].includes(previousRecord.status)) return false;
  if (!['Draft', 'Pending'].includes(nextRecord.status)) return false;
  const immutableKeys = [
    'id', 'applicantId', 'applicantName', 'department',
    'createdAt', 'relatedId', 'relatedType'
  ];
  if (immutableKeys.some(key => !sameJson(previousRecord[key], nextRecord?.[key]))) return false;
  if (!isCleanApprovalSubmission(nextRecord)) return false;
  return true;
}

function canApproverAuditApproval(user, nextRecord, previousRecord) {
  if (!hasReadWrite(user) || previousRecord?.status !== 'Pending') return false;
  if (!pendingApprovalIds(previousRecord).includes(user.id)) return false;

  const immutableKeys = [
    'id', 'title', 'type', 'applicantId', 'applicantName', 'department',
    'strategy', 'approverIds', 'approverNamesDisplay', 'currentContent',
    'currentAttachments', 'createdAt', 'relatedId', 'relatedType'
  ];
  if (immutableKeys.some(key => !sameJson(previousRecord[key], nextRecord?.[key]))) return false;

  const previousVersions = approvalVersions(previousRecord);
  const nextVersions = approvalVersions(nextRecord);
  if (previousVersions.length === 0 || previousVersions.length !== nextVersions.length) return false;
  for (let index = 1; index < previousVersions.length; index += 1) {
    if (!sameJson(previousVersions[index], nextVersions[index])) return false;
  }

  const previousLatest = previousVersions[0];
  const nextLatest = nextVersions[0];
  for (const key of ['version', 'content', 'attachments', 'submittedAt']) {
    if (!sameJson(previousLatest[key], nextLatest?.[key])) return false;
  }

  const previousOutcomes = Array.isArray(previousLatest.outcomes) ? previousLatest.outcomes : [];
  const nextOutcomes = Array.isArray(nextLatest?.outcomes) ? nextLatest.outcomes : [];
  if (nextOutcomes.length !== previousOutcomes.length + 1) return false;
  if (!sameJson(previousOutcomes, nextOutcomes.slice(0, previousOutcomes.length))) return false;

  const addedOutcome = nextOutcomes[nextOutcomes.length - 1];
  if (addedOutcome?.approverId !== user.id) return false;
  if (addedOutcome?.approverName !== user.nickname) return false;
  if (!['Approved', 'Rejected', 'Returned'].includes(addedOutcome?.status)) return false;
  if (typeof addedOutcome.comment !== 'string' || typeof addedOutcome.date !== 'string') return false;
  if (latestApprovalOutcomes(previousRecord).some(outcome => outcome.approverId === user.id)) return false;

  return nextRecord.status === expectedApprovalStatus(previousRecord, nextOutcomes, addedOutcome.status);
}

function canUpdateApprovalRecord(user, nextRecord, previousRecord) {
  if (isAdministrator(user)) return true;
  return canApplicantUpdateApproval(user, nextRecord, previousRecord) ||
    canApproverAuditApproval(user, nextRecord, previousRecord);
}

export function getResourceDefinition(resource) {
  return RESOURCE_DEFINITIONS[resource] || null;
}

export function getResourcePolicy(resource) {
  return getResourceDefinition(resource)?.read || null;
}

export function canWriteResource(resource, user, record, context = {}) {
  const definition = getResourceDefinition(resource);
  if (!definition || !user) return false;
  if (isAdministrator(user)) return true;
  if (definition.write === 'admin') return false;
  if (definition.write === 'owner') return isOwnedRecord(resource, user, record);
  if (definition.write === 'readwrite') return hasReadWrite(user);

  if (resource === 'clients') {
    return canWriteClientRecord(user, record, context);
  }

  if (OWNER_SCOPED_RESOURCES.has(resource)) {
    return canWriteOwnerScopedRecord(user, record, context);
  }

  if (resource === 'projects') {
    if (!hasReadWrite(user)) return false;
    if (isExecutive(user)) return true;
    if (PROJECT_WRITE_DEPARTMENTS.has(user.department)) {
      return !record?.manager || record.manager === user.nickname || isDepartmentManager(user) || user.role === 'Manager';
    }
    return false;
  }

  if (resource === 'payments') {
    if (!hasReadWrite(user) || !MONEY_WRITE_DEPARTMENTS.has(user.department)) return false;
    return isExecutive(user) || canSeeProjectRecord(user, record, context) || record?.creatorId === user.id;
  }

  if (resource === 'production') {
    if (!hasReadWrite(user) || !PRODUCTION_WRITE_DEPARTMENTS.has(user.department)) return false;
    return isExecutive(user) || canSeeProjectRecord(user, record, context);
  }

  if (['archives', 'schedule'].includes(resource)) {
    if (!hasReadWrite(user)) return false;
    return canSeeProjectRecord(user, record, context) || record?.uploader === user.nickname || record?.assignee === user.nickname || record?.userId === user.id;
  }

  if (resource === 'worklogs') {
    if (!hasReadWrite(user)) return false;
    if (record?.userId === user.id || record?.userName === user.nickname) return true;
    return isDepartmentManager(user) && sameDepartmentNicknames(user, context).has(record?.userName);
  }

  if (resource === 'approvals') {
    if (context?.action === 'create') return isApprovalCreateAllowed(user, record);
    if (context?.action === 'delete') return isApprovalDeleteAllowed(user, record);
    return false;
  }

  if (['messages', 'channels', 'announcements'].includes(resource)) {
    return hasReadWrite(user) && canSeeChannelRecord(user, record, context);
  }

  return definition.write === 'authenticated' && hasReadWrite(user);
}


export function canUpdateResource(resource, user, nextRecord, previousRecord, context = {}) {
  if (resource === 'approvals') {
    return canUpdateApprovalRecord(user, nextRecord, previousRecord);
  }
  if (OWNER_SCOPED_RESOURCES.has(resource)) {
    if (previousRecord && !sameJson(previousRecord.creatorId ?? null, nextRecord?.creatorId ?? null)) return false;
    return canWriteResource(resource, user, previousRecord || nextRecord, { ...context, action: 'update' });
  }
  return canWriteResource(resource, user, nextRecord, { ...context, action: 'update' });
}

export function filterReadableRecords(resource, user, records, context = {}) {
  const definition = getResourceDefinition(resource);
  if (!definition || !user) return [];
  if (isAdministrator(user)) return records;
  if (definition.read === 'admin') return [];
  if (definition.read === 'owner') return records.filter(record => isOwnedRecord(resource, user, record));
  if (definition.read === 'authenticated') return records;
  if (resource === 'clients') return records.filter(record => canSeeClientRecord(user, record, context));
  if (OWNER_SCOPED_RESOURCES.has(resource)) return records.filter(record => canSeeOwnerScopedRecord(user, record, context));
  if (resource === 'projects') return records.filter(record => canSeeProject(user, record, context));
  if (['payments', 'production', 'archives', 'schedule'].includes(resource)) return records.filter(record => canSeeProjectRecord(user, record, context));
  if (resource === 'worklogs') return records.filter(record => record.userId === user.id || record.userName === user.nickname || (isDepartmentManager(user) && sameDepartmentNicknames(user, context).has(record.userName)));
  if (resource === 'approvals') return records.filter(record => canSeeApproval(user, record));
  if (['messages', 'channels', 'announcements'].includes(resource)) return records.filter(record => canSeeChannelRecord(user, record, context));
  return records;
}

function sanitizePreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return preferences;
  const { webhooks: _webhooks, ...safePreferences } = preferences;
  return safePreferences;
}

export function sanitizeResourceRecord(resource, record) {
  if (!record || typeof record !== 'object') return record;

  if (resource === 'users') {
    const { password: _password, authCode: _authCode, preferences, ...safeUser } = record;
    return {
      ...safeUser,
      ...(preferences ? { preferences: sanitizePreferences(preferences) } : {})
    };
  }

  if (resource === 'email_configs') {
    const { authCode: _authCode, ...safeConfig } = record;
    return safeConfig;
  }

  if (resource === 'ai_messages' && Array.isArray(record.attachments)) {
    return {
      ...record,
      attachments: record.attachments.map(({ base64Data: _base64Data, ...attachment }) => attachment)
    };
  }

  return record;
}
