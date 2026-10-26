export type BookmarkNode = { id: string; name: string; type: 'channel' | 'block' };

const storageKey = 'arena-vis:bookmarks';
const snapshotKeys = ['id', 'name', 'type', 'val', 'blockData', 'channelData', 'imageUrl', 'previewUrl'] as const;

// Force-graph mutates nodes with positions, velocities and three.js objects; keep only the serializable fields.
export function snapshotNode<N extends BookmarkNode>(node: N): N {
  const snapshot: Record<string, unknown> = {};
  for (const key of snapshotKeys) if (key in node) snapshot[key] = (node as Record<string, unknown>)[key];
  return snapshot as N;
}

export function toggleBookmark<N extends BookmarkNode>(bookmarks: readonly N[], node: N): N[] {
  return bookmarks.some(entry => entry.id === node.id)
    ? bookmarks.filter(entry => entry.id !== node.id)
    : [snapshotNode(node), ...bookmarks];
}

export function parseBookmarks<N extends BookmarkNode>(value: unknown): N[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is N =>
    typeof entry?.id === 'string' && typeof entry.name === 'string' && (entry.type === 'channel' || entry.type === 'block'));
}

// Storage can be missing (server render), blocked, or hold malformed JSON; any of those means no bookmarks.
export function loadBookmarks<N extends BookmarkNode>(): N[] {
  try {
    return parseBookmarks<N>(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: readonly BookmarkNode[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(bookmarks));
  } catch {}
}
