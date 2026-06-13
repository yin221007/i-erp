function parseRecord(value) {
  if (value && typeof value === 'object') return structuredClone(value);
  return JSON.parse(value);
}

function compactText(value, maximumLength = 500) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength - 1)}…`;
}

function hasConfiguredChannel(webhooks) {
  if (!webhooks || typeof webhooks !== 'object') return false;
  return [
    webhooks.pushPlusToken,
    webhooks.wecomWebhook,
    webhooks.dingtalkWebhook
  ].some(value => String(value || '').trim());
}

function notificationEnabled(user, category) {
  return user?.preferences?.types?.[category] !== false;
}

function currentOutcomes(approval) {
  if (!Array.isArray(approval?.versions)) return [];
  return approval.versions.flatMap(version =>
    Array.isArray(version?.outcomes) ? version.outcomes : []
  );
}

function currentApproverIds(approval) {
  if (approval?.status !== 'Pending') return [];
  const approverIds = Array.isArray(approval.approverIds)
    ? approval.approverIds
    : [];
  const signedIds = new Set(
    currentOutcomes(approval).map(outcome => outcome?.approverId)
  );
  const unsignedIds = approverIds.filter(id => !signedIds.has(id));
  if (approval.strategy === 'SEQUENTIAL') {
    return unsignedIds.length > 0 ? [unsignedIds[0]] : [];
  }
  return unsignedIds;
}

function approvalStatusLabel(status) {
  if (status === 'Approved') return '已通过';
  if (status === 'Rejected') return '已驳回';
  if (status === 'Returned') return '已退回';
  return '状态已更新';
}

export function createNotificationDispatcher({
  pool,
  pushService,
  logger = console
}) {
  async function loadUsers() {
    const [rows] = await pool.query('SELECT json_data FROM users');
    return rows.map(row => parseRecord(row.json_data));
  }

  async function loadChannel(channelId) {
    const [rows] = await pool.query(
      'SELECT json_data FROM channels WHERE id = ? LIMIT 1',
      [channelId]
    );
    return rows.length > 0 ? parseRecord(rows[0].json_data) : null;
  }

  async function deliver(users, recipientIds, category, message, actorId) {
    const recipients = users.filter(user =>
      recipientIds.has(user.id) &&
      user.id !== actorId &&
      notificationEnabled(user, category) &&
      hasConfiguredChannel(user.preferences?.webhooks)
    );
    await Promise.all(recipients.map(async user => {
      try {
        await pushService.sendConfigured(
          user.preferences.webhooks,
          message
        );
      } catch (error) {
        logger.error('[Notification] Delivery failed', {
          category,
          userId: user.id,
          error: String(error?.message || 'Unknown push error').slice(0, 200)
        });
      }
    }));
  }

  async function dispatchChat(users, record, resource, action, actor) {
    if (action !== 'create') return;
    const channel = await loadChannel(record.channelId);
    if (!channel) return;

    let recipientIds;
    if (channel.type === 'General') {
      recipientIds = new Set(users.map(user => user.id));
    } else {
      recipientIds = new Set(
        Array.isArray(channel.participants) ? channel.participants : []
      );
      if (channel.type === 'Project') {
        users
          .filter(user => user.role === 'Admin' || user.isDefaultAdmin === true)
          .forEach(user => recipientIds.add(user.id));
      }
    }

    if (resource === 'announcements') {
      await deliver(users, recipientIds, 'chat', {
        title: `i ERP 公告 · ${compactText(channel.name, 80)}`,
        content: `${compactText(record.creatorName || actor?.nickname || '系统')}：${compactText(record.content)}`
      }, actor?.id || record.creatorId);
      return;
    }

    const summary = compactText(record.content) ||
      (Array.isArray(record.attachments) && record.attachments.length > 0
        ? `[附件] ${compactText(record.attachments[0]?.name || '新文件')}`
        : '发送了一条新消息');
    await deliver(users, recipientIds, 'chat', {
      title: `i ERP 聊天 · ${compactText(channel.name, 80)}`,
      content: `${compactText(record.userName || actor?.nickname || '成员')}：${summary}`
    }, actor?.id || record.userId);
  }

  async function dispatchApproval(users, approval, action, context) {
    if (!['create', 'update'].includes(action)) return;
    const previous = context?.previousRecord || null;
    const actorId = context?.actor?.id;
    const previousApprovers = new Set(currentApproverIds(previous));
    const nextApprovers = new Set(
      currentApproverIds(approval).filter(id => !previousApprovers.has(id))
    );

    if (nextApprovers.size > 0) {
      await deliver(users, nextApprovers, 'approval', {
        title: 'i ERP 待审批提醒',
        content: `${compactText(approval.applicantName || '申请人')}提交：${compactText(approval.title)}`
      }, actorId);
    }

    const statusChanged =
      previous &&
      previous.status !== approval.status &&
      ['Approved', 'Rejected', 'Returned'].includes(approval.status);
    if (statusChanged && approval.applicantId) {
      await deliver(users, new Set([approval.applicantId]), 'approval', {
        title: `i ERP 审批${approvalStatusLabel(approval.status)}`,
        content: `${compactText(approval.title)}：${approvalStatusLabel(approval.status)}`
      }, actorId);
    }
  }

  return async function dispatch(resource, record, action, context = {}) {
    if (
      !['messages', 'announcements', 'approvals'].includes(resource)
    ) {
      return;
    }
    try {
      const users = await loadUsers();
      if (resource === 'messages' || resource === 'announcements') {
        await dispatchChat(users, record, resource, action, context.actor);
      } else {
        await dispatchApproval(users, record, action, context);
      }
    } catch (error) {
      logger.error('[Notification] Event dispatch failed', {
        resource,
        recordId: record?.id,
        error: String(error?.message || 'Unknown notification error')
          .slice(0, 200)
      });
    }
  };
}
