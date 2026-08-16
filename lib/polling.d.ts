export const POLL_TICK_MILLISECONDS: number;
export const STANDARD_POLL_INTERVAL_MILLISECONDS: number;
export const GLOBAL_POLL_INTERVAL_MILLISECONDS: number;

export function getPollPlan(options: {
  activeView: string;
  isSettingsOpen?: boolean;
  now?: number;
  lastViewPollAt?: number;
  lastGlobalPollAt?: number;
}): {
  resources: string[];
  nextViewPollAt: number;
  nextGlobalPollAt: number;
};
