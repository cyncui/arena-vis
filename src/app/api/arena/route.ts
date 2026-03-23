export const dynamic = 'force-dynamic';

interface ArenaBlock {
  id: number;
  title: string | null;
  content: string | null;
  type: string;
  image?: {
    url: string;
    display: string;
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

function getBlockPreview(block: any): string {
  if (block.image?.src) return block.title || 'Image';
  if (block.embed?.html) return block.title || 'Embed';
  if (block.attachment?.url) return block.attachment.filename;
  const text = typeof block.content === 'string' ? block.content : block.content?.plain;
  if (text) return text.substring(0, 100) + (text.length > 100 ? '...' : '');
  if (block.title) return block.title;
  return 'Block';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return Response.json({ error: 'Slug is required' }, { status: 400 });
  }

  try {
    const channelRes = await fetchWithRetry(`https://api.are.na/v3/channels/${slug}`);
    
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

    const items = contents.data || [];
    const blocks = items.filter((item: any) => item.base_type === 'Block');

    if (blocks.length === 0) {
      return Response.json({ 
        error: 'No blocks found in this channel' 
      }, { status: 404 });
    }

    const randomBlock = blocks[Math.floor(Math.random() * blocks.length)] as ArenaBlock;
    const [blockRes, blockConnectionsRes] = await Promise.all([
      fetchWithRetry(`https://api.are.na/v3/blocks/${randomBlock.id}`),
      fetchWithRetry(`https://api.are.na/v3/blocks/${randomBlock.id}/connections?per=50`),
    ]);
    const fullBlock = await blockRes.json();
    const blockConnections = await blockConnectionsRes.json();

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const rootChannelId = `channel-${channel.id}`;
    const previewBlock = blocks.find((b: any) => b.image?.small?.src || b.image?.src);
    const rootPreviewUrl = previewBlock?.image?.small?.src || previewBlock?.image?.src || undefined;
    nodes.push({
      id: rootChannelId,
      name: channel.title || channel.slug,
      type: 'channel',
      val: 30,
      channelData: channel,
      previewUrl: rootPreviewUrl,
    });

    const blockNodeId = `block-${randomBlock.id}`;
    const blockImgUrl = fullBlock.image?.small?.src || fullBlock.image?.src || undefined;
    nodes.push({
      id: blockNodeId,
      name: getBlockPreview(fullBlock),
      type: 'block',
      val: 20,
      blockData: fullBlock,
      imageUrl: blockImgUrl,
    });

    links.push({
      source: rootChannelId,
      target: blockNodeId,
    });

    const allConnected = blockConnections.data || [];
    const connectedChannels = allConnected.sort(() => Math.random() - 0.5).slice(0, 10);
    connectedChannels.forEach((conn: any) => {
      const connChannelId = `channel-${conn.id}`;
      if (!nodes.find(n => n.id === connChannelId)) {
        nodes.push({
          id: connChannelId,
          name: conn.title || conn.slug,
          type: 'channel',
          val: 15,
          channelData: conn,
        });
        links.push({
          source: blockNodeId,
          target: connChannelId,
        });
      }
    });

    const graphData: GraphData = { nodes, links };

    return Response.json({
      channel,
      block: fullBlock,
      graphData,
    });
  } catch (error) {
    return Response.json({
      error: 'Failed to fetch data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
