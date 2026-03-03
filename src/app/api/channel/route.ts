export const dynamic = 'force-dynamic';

interface ArenaBlock {
  id: number;
  title: string | null;
  content: any;
  type: string;
  base_type?: string;
  image?: {
    src: string;
    small?: { src: string };
    medium?: { src: string };
    [key: string]: any;
  };
  embed?: {
    html: string;
  };
  attachment?: {
    url: string;
    filename: string;
  };
}

interface ArenaChannel {
  id: number;
  slug: string;
  title: string;
  length: number;
}

interface GraphNode {
  id: string;
  name: string;
  type: 'channel' | 'block';
  val: number;
  blockData?: any;
  channelData?: any;
  imageUrl?: string;
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

function getBlockPreview(block: any): string {
  if (block.image?.src) return block.title || 'Image';
  if (block.embed?.html) return block.title || 'Embed';
  if (block.attachment?.url) return block.attachment.filename;
  const text = typeof block.content === 'string' ? block.content : block.content?.plain;
  if (text) return text.substring(0, 100) + (text.length > 100 ? '...' : '');
  if (block.title) return block.title;
  return 'Block';
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
  const channelId = searchParams.get('id');

  if (!channelId) {
    return Response.json({ error: 'Channel ID is required' }, { status: 400 });
  }

  try {
    const channelRes = await fetchWithRetry(`https://api.are.na/v3/channels/${channelId}`);
    
    if (!channelRes.ok) {
      return Response.json({ 
        error: 'Channel not found',
        details: await channelRes.text()
      }, { status: channelRes.status });
    }

    const channel: ArenaChannel = await channelRes.json();

    const contentsRes = await fetchWithRetry(
      `https://api.are.na/v3/channels/${channel.id}/contents?per=100`
    );
    const contents = await contentsRes.json();

    const connectionsRes = await fetchWithRetry(
      `https://api.are.na/v3/channels/${channel.id}/connections?per=100`
    );
    const connections = await connectionsRes.json();

    const items = contents.data || [];
    const blocks = items.filter((item: any) => item.base_type === 'Block') as ArenaBlock[];
    const subChannels = items.filter((item: any) => item.type === 'Channel') as ArenaChannel[];

    if (blocks.length === 0 && subChannels.length === 0) {
      return Response.json({ 
        error: 'No blocks or channels found in this channel' 
      }, { status: 404 });
    }

    const randomBlocks = shuffleArray(blocks).slice(0, 20);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const rootChannelId = `channel-${channel.id}`;
    nodes.push({
      id: rootChannelId,
      name: channel.title || channel.slug,
      type: 'channel',
      val: 30,
      channelData: channel,
    });

    for (const block of randomBlocks) {
      const blockNodeId = `block-${block.id}`;
      const blockImgUrl = block.image?.small?.src || block.image?.src || undefined;
      nodes.push({
        id: blockNodeId,
        name: getBlockPreview(block),
        type: 'block',
        val: 15,
        blockData: block,
        imageUrl: blockImgUrl,
      });
      links.push({
        source: rootChannelId,
        target: blockNodeId,
      });
    }

    const randomSubChannels = shuffleArray(subChannels).slice(0, 5);
    for (const sub of randomSubChannels) {
      const subId = `channel-${sub.id}`;
      if (!nodes.find(n => n.id === subId)) {
        nodes.push({
          id: subId,
          name: sub.title || sub.slug,
          type: 'channel',
          val: 12,
          channelData: sub,
        });
      }
      links.push({
        source: rootChannelId,
        target: subId,
      });
    }

    const graphData: GraphData = { nodes, links };

    return Response.json({
      channel,
      blocks: randomBlocks,
      connections: connections.data || [],
      graphData,
    });
  } catch (error) {
    return Response.json({
      error: 'Failed to fetch data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
