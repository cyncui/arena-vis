export const dynamic = 'force-dynamic';

interface GraphNode {
  id: string;
  name: string;
  type: 'channel' | 'block';
  val: number;
  blockData?: any;
  channelData?: any;
  imageUrl?: string;
  previewUrl?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return Response.json({ error: 'Username is required' }, { status: 400 });
  }

  try {
    // Fetch user info (accepts slug or id)
    const userRes = await fetchWithRetry(`https://api.are.na/v3/users/${encodeURIComponent(username)}`);
    if (!userRes.ok) {
      return Response.json({
        error: 'User not found',
        details: await userRes.text(),
      }, { status: userRes.status });
    }
    const user = await userRes.json();

    // Fetch user's contents and filter for channels
    const contentsRes = await fetchWithRetry(
      `https://api.are.na/v3/users/${user.slug}/contents?per=100`
    );
    if (!contentsRes.ok) {
      return Response.json({
        error: 'Failed to fetch user contents',
        details: await contentsRes.text(),
      }, { status: contentsRes.status });
    }
    const contentsData = await contentsRes.json();
    const items = contentsData.data || contentsData || [];
    const channels = items
      .filter((item: any) => item.type === 'Channel')
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Create central user node (rendered as a channel type with large val)
    const userNodeId = `channel-user-${user.id}`;
    nodes.push({
      id: userNodeId,
      name: user.full_name || user.username || username,
      type: 'channel',
      val: 35,
      channelData: { id: `user-${user.id}`, slug: username, title: user.full_name || user.username },
    });

    // Add the 5 most recently updated channels
    for (const ch of channels) {
      const channelId = `channel-${ch.id}`;
      if (nodes.find(n => n.id === channelId)) continue;
      nodes.push({
        id: channelId,
        name: ch.title || ch.slug,
        type: 'channel',
        val: 15,
        channelData: ch,
      });
      links.push({
        source: userNodeId,
        target: channelId,
      });
    }

    const graphData: GraphData = { nodes, links };

    return Response.json({ graphData });
  } catch (error) {
    return Response.json({
      error: 'Failed to fetch user data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
