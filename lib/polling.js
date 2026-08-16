export const POLL_TICK_MILLISECONDS = 5_000;
export const STANDARD_POLL_INTERVAL_MILLISECONDS = 15_000;
export const GLOBAL_POLL_INTERVAL_MILLISECONDS = 60_000;

const VIEW_RESOURCES = Object.freeze({
  home: ['projects', 'production', 'payments', 'approvals', 'worklogs', 'archives'],
  projects: ['projects', 'archives'],
  production: ['projects', 'production'],
  approvals: ['approvals', 'users'],
  payments: ['payments', 'projects', 'archives', 'clients'],
  schedule: ['schedule', 'projects', 'users'],
  worklogs: ['worklogs', 'users'],
  chat: ['messages', 'channels', 'announcements', 'users', 'projects'],
  archives: ['archives', 'projects'],
  clients: ['clients'],
  equipment: ['equipment'],
  docs: ['docs'],
  ai_center: ['ai_messages'],
  users: ['users'],
  recycle_bin: ['recycle_bin']
});

const GLOBAL_RESOURCES = Object.freeze(['users', 'announcements']);

export function getPollPlan({
  activeView,
  isSettingsOpen = false,
  now = Date.now(),
  lastViewPollAt = 0,
  lastGlobalPollAt = 0
}) {
  const resources = new Set();
  const viewInterval = activeView === 'chat'
    ? POLL_TICK_MILLISECONDS
    : STANDARD_POLL_INTERVAL_MILLISECONDS;
  const shouldPollView = now - lastViewPollAt >= viewInterval;
  const shouldPollGlobal =
    now - lastGlobalPollAt >= GLOBAL_POLL_INTERVAL_MILLISECONDS;

  if (shouldPollView) {
    for (const resource of VIEW_RESOURCES[activeView] || []) {
      resources.add(resource);
    }
    if (isSettingsOpen) resources.add('settings');
  }

  if (shouldPollGlobal) {
    for (const resource of GLOBAL_RESOURCES) resources.add(resource);
  }

  return {
    resources: [...resources],
    nextViewPollAt: shouldPollView ? now : lastViewPollAt,
    nextGlobalPollAt: shouldPollGlobal ? now : lastGlobalPollAt
  };
}
