function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function iiifSourceId(paneId: string, sublayerId: string, role: string): string {
  return `iiif-source-${role}-${paneId}-${sanitize(sublayerId)}`;
}

export function iiifLayerId(paneId: string, sublayerId: string, role: string): string {
  return `iiif-layer-${role}-${paneId}-${sanitize(sublayerId)}`;
}

interface IiifGroupState {
  cleanups: Array<() => void>;
  renderToken: number;
}

const groupsByPane = new Map<string, Map<string, IiifGroupState>>();

function paneGroups(paneId: string): Map<string, IiifGroupState> {
  let groups = groupsByPane.get(paneId);
  if (!groups) {
    groups = new Map();
    groupsByPane.set(paneId, groups);
  }
  return groups;
}

/**
 * Starts a new render attempt for a group and returns a token. Callers doing async
 * work should check `isCurrentIiifRender` before mutating the map so a stale render
 * (superseded by a rapid toggle-off/on) does not add layers after teardown.
 */
export function beginIiifRender(paneId: string, sublayerId: string): number {
  const groups = paneGroups(paneId);
  const existing = groups.get(sublayerId);
  const token = (existing?.renderToken ?? 0) + 1;
  groups.set(sublayerId, { cleanups: existing?.cleanups ?? [], renderToken: token });
  return token;
}

export function isCurrentIiifRender(paneId: string, sublayerId: string, token: number): boolean {
  return paneGroups(paneId).get(sublayerId)?.renderToken === token;
}

export function registerIiifCleanup(paneId: string, sublayerId: string, cleanup: () => void): void {
  const groups = paneGroups(paneId);
  const group = groups.get(sublayerId);
  if (group) {
    group.cleanups.push(cleanup);
  } else {
    groups.set(sublayerId, { cleanups: [cleanup], renderToken: 0 });
  }
}

export function removeIiifGroup(paneId: string, sublayerId: string): void {
  const groups = paneGroups(paneId);
  const group = groups.get(sublayerId);
  if (!group) return;
  groups.delete(sublayerId);
  for (const cleanup of group.cleanups) {
    cleanup();
  }
}
