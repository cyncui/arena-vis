export const dynamic = 'force-dynamic';

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.ARENA_ACCESS_TOKEN || ''}`,
      },
      next: { revalidate: 60 },
    });
    if (res.ok) return res;
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      continue;
    }
    if (i === retries - 1) return res;
  }
  throw new Error('Failed to fetch');
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get('id');
  const excludeRaw = searchParams.get('exclude') || '';

  if (!blockId) {
    return Response.json({ error: 'Block ID is required' }, { status: 400 });
  }

  const excludeIds = new Set(excludeRaw.split(',').filter(Boolean));

  try {
    const res = await fetchWithRetry(
      `https://api.are.na/v3/blocks/${blockId}/connections?per=100`
    );
    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch connections' }, { status: res.status });
    }

    const data = await res.json();
    const allChannels = (data.data || []).filter(
      (ch: any) => !excludeIds.has(`channel-${ch.id}`)
    );

    const picked = shuffleArray(allChannels).slice(0, 3);
    const allExplored = allChannels.length <= 3;

    const nodes = picked.map((ch: any) => ({
      id: `channel-${ch.id}`,
      name: ch.title || ch.slug,
      type: 'channel' as const,
      val: 12,
      channelData: ch,
    }));

    const links = picked.map((ch: any) => ({
      source: `block-${blockId}`,
      target: `channel-${ch.id}`,
    }));

    return Response.json({
      graphData: { nodes, links },
      allExplored,
      totalConnections: (data.data || []).length,
      remainingConnections: allChannels.length - picked.length,
    });
  } catch (error) {
    return Response.json({
      error: 'Failed to fetch block connections',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
