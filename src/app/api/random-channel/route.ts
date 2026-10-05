export const dynamic = 'force-dynamic';

interface FollowedChannel {
  id: number;
  type: 'Channel';
  slug: string;
  title: string;
}

interface FollowingPage {
  total: number;
  channel: FollowedChannel | null;
}

class FollowingError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

function parseFollowingPage(value: unknown): FollowingPage {
  if (!value || typeof value !== 'object' || !('data' in value) || !('meta' in value)) {
    throw new FollowingError('could not read your followed channels. please try again.');
  }
  const { data, meta } = value;
  if (!Array.isArray(data) || data.length > 1 || !meta || typeof meta !== 'object' || !('total_count' in meta)) {
    throw new FollowingError('could not read your followed channels. please try again.');
  }
  const total = meta.total_count;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new FollowingError('could not read your followed channels. please try again.');
  }
  const channel = data[0];
  if (channel !== undefined && (
    !channel || typeof channel !== 'object' || channel.type !== 'Channel' ||
    !Number.isSafeInteger(channel.id) || channel.id <= 0 ||
    typeof channel.slug !== 'string' || !channel.slug.trim() ||
    typeof channel.title !== 'string'
  )) {
    throw new FollowingError('could not read your followed channels. please try again.');
  }
  return { total, channel: channel ?? null };
}

async function fetchFollowingPage(username: string, page: number, fresh = false): Promise<FollowingPage> {
  const token = process.env.ARENA_ACCESS_TOKEN;
  const params = new URLSearchParams({ type: 'Channel', per: '1', page: String(page), sort: 'created_at_desc' });
  const response = await fetch(`https://api.are.na/v3/users/${encodeURIComponent(username)}/following?${params}`, {
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    ...(token || fresh ? { cache: 'no-store' as const } : { next: { revalidate: 60 } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new FollowingError(
      response.status === 429
        ? 'are.na is busy. please try again in a moment.'
        : 'could not load your followed channels. please try again.',
      response.status === 429 ? 429 : 502,
    );
  }
  return parseFollowingPage(await response.json());
}

export async function GET() {
  const username = process.env.ARENA_USERNAME?.trim() || 'cynthia';
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const fresh = attempt > 0;
      const first = await fetchFollowingPage(username, 1, fresh);
      if (first.total === 0) {
        return Response.json({ error: 'no followed channels found for this profile.' }, { status: 404 });
      }
      const index = Math.floor(Math.random() * first.total);
      const selected = index === 0 ? first : await fetchFollowingPage(username, index + 1, fresh);
      if (selected.channel) {
        const { slug, title } = selected.channel;
        return Response.json({ channel: { slug, title } }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return Response.json({ error: 'your followed channels changed. please try again.' }, { status: 503 });
  } catch (error) {
    return Response.json({
      error: error instanceof FollowingError ? error.message : 'could not load your followed channels. please try again.',
    }, { status: error instanceof FollowingError ? error.status : 502 });
  }
}
