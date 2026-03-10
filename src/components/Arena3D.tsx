'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

let _THREE: any = null;
function getThree() {
  if (!_THREE) _THREE = require('three');
  return _THREE;
}

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-screen text-white gap-4 font-pixel">
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-white"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
      Loading 3D Engine...
    </div>
  ),
});

interface ArenaBlock {
  id: number;
  title: string | null;
  content: string | { markdown: string; html: string; plain: string } | null;
  type: string;
  base_type: string;
  image?: {
    src: string;
    small?: { src: string };
    medium?: { src: string };
  };
  embed?: {
    html: string;
  };
  source?: {
    url: string;
    title: string;
  };
}

interface ArenaChannel {
  id: number;
  slug: string;
  title: string;
  length?: number;
  counts?: {
    blocks: number;
    channels: number;
    contents: number;
  };
}

interface GraphNode {
  id: string;
  name: string;
  type: 'channel' | 'block';
  val: number;
  blockData?: ArenaBlock;
  channelData?: ArenaChannel;
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

interface Arena3DProps {
  initialSlug: string;
}

function getContentText(block: ArenaBlock): string | null {
  if (!block.content) return null;
  if (typeof block.content === 'string') return block.content;
  return block.content.plain || null;
}

function getLinkKey(link: any): string {
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  return `${s}__${t}`;
}

function createBracketVertices(r: number): Float32Array {
  const gap = r * 0.35;
  const tick = r * 0.45;
  const h = r * 1.1;
  const x = r + gap;

  return new Float32Array([
    // Left bracket [
    -x, -h, 0, -x, h, 0,
    -x, h, 0, -x + tick, h, 0,
    -x, -h, 0, -x + tick, -h, 0,
    // Right bracket ]
    x, -h, 0, x, h, 0,
    x, h, 0, x - tick, h, 0,
    x, -h, 0, x - tick, -h, 0,
  ]);
}

export default function Arena3D({ initialSlug }: Arena3DProps) {
  const fgRef = useRef<any>(null);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(!!initialSlug);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [history, setHistory] = useState<GraphNode[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [exploredBlocks, setExploredBlocks] = useState<Set<string>>(new Set());
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [exploring, setExploring] = useState(false);
  const exploringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textureCache = useRef<Map<string, any>>(new Map());
  const keysPressed = useRef<Set<string>>(new Set());
  const selectedNodeRef = useRef<GraphNode | null>(null);
  const prevSelectedFgNodeRef = useRef<any>(null);
  const graphDataRef = useRef<GraphData | null>(null);

  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);

  useEffect(() => {
    const THREE = getThree();
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      keysPressed.current.add(e.key.toLowerCase());
      if (e.key === 'Shift') {
        const controls = fgRef.current?.controls();
        if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
      if (e.key === 'Shift') {
        const controls = fgRef.current?.controls();
        if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let animId: number;
    const tick = () => {
      const fg = fgRef.current;
      if (!fg) { animId = requestAnimationFrame(tick); return; }
      const camera = fg.camera();
      const keys = keysPressed.current;
      if (keys.size === 0) { animId = requestAnimationFrame(tick); return; }

      const speed = keys.has('shift') ? 8 : 3;
      const dir = camera.getWorldDirection(new (getThree().Vector3)());
      const right = dir.clone().cross(camera.up).normalize();
      const up = camera.up.clone().normalize();

      if (keys.has('w')) camera.position.addScaledVector(dir, speed);
      if (keys.has('s')) camera.position.addScaledVector(dir, -speed);
      if (keys.has('a')) camera.position.addScaledVector(right, -speed);
      if (keys.has('d')) camera.position.addScaledVector(right, speed);
      if (keys.has('q')) camera.position.addScaledVector(up, -speed);
      if (keys.has('e')) camera.position.addScaledVector(up, speed);

      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const starredScenes = useRef<WeakSet<object>>(new WeakSet());
  useEffect(() => {
    const interval = setInterval(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const scene = fg.scene();
      if (!scene || starredScenes.current.has(scene)) return;
      starredScenes.current.add(scene);
      clearInterval(interval);

      const THREE = getThree();
      const count = 2000;
      const positions = new Float32Array(count * 3);
      const spread = 3000;

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      });

      scene.add(new THREE.Points(geo, mat));
    }, 200);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async (channelSlug: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/arena?slug=${encodeURIComponent(channelSlug)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch data');
        setGraphData(null);
        return;
      }

      setGraphData(data.graphData);
      setSelectedNode(null);
      setHistory([]);
      setExploredBlocks(new Set());
    } catch (err) {
      setError('Failed to fetch data');
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialSlug) {
      fetchData(initialSlug);
    }
  }, [initialSlug, fetchData]);

  const extractSlug = (input: string): string => {
    const trimmed = input.trim();
    try {
      const url = new URL(trimmed);
      if (url.hostname.endsWith('are.na')) {
        const segments = url.pathname.split('/').filter(Boolean);
        return segments[segments.length - 1] || '';
      }
    } catch {
      // not a URL — treat as a raw slug
    }
    return trimmed.replace(/^-/, '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newSlug = extractSlug(slug);
    if (newSlug) {
      router.push(`/?slug=${encodeURIComponent(newSlug)}`);
      fetchData(newSlug);
    }
  };

  const selectNode = useCallback((node: GraphNode) => {
    setSidebarMinimized(false);
    setSelectedNode(prev => {
      if (prev && prev.id !== node.id) {
        setHistory(h => {
          if (h.length > 0 && h[h.length - 1].id === prev.id) return h;
          return [...h, prev];
        });
      }
      return node;
    });
  }, []);

  const jumpToHistory = useCallback((index: number) => {
    const prev = prevSelectedFgNodeRef.current;
    if (prev?.type === 'block' && !prev.imageUrl && prev.__threeObj?.material?.color) {
      prev.__threeObj.material.color.setHex(0x95e1d3);
      prev.__threeObj.material.emissive.setHex(0x95e1d3);
    }
    prevSelectedFgNodeRef.current = null;
    setHistory(h => {
      const target = h[index];
      setSelectedNode(target);
      return h.slice(0, index);
    });
  }, []);

  const handleNodeClick = useCallback(async (node: any) => {
    const graphNode = node as GraphNode;

    const prev = prevSelectedFgNodeRef.current;
    if (prev?.type === 'block' && !prev.imageUrl && prev.__threeObj?.material?.color) {
      prev.__threeObj.material.color.setHex(0x95e1d3);
      prev.__threeObj.material.emissive.setHex(0x95e1d3);
    }
    if (graphNode.type === 'block' && !graphNode.imageUrl && node.__threeObj?.material?.color) {
      node.__threeObj.material.color.setHex(0xffd93d);
      node.__threeObj.material.emissive.setHex(0xffd93d);
    }
    prevSelectedFgNodeRef.current = node;

    selectNode(graphNode);

    if (exploringTimer.current) clearTimeout(exploringTimer.current);
    exploringTimer.current = setTimeout(() => setExploring(true), 500);

    try {
      if (graphNode.type === 'channel') {
        const channelId = node.id.replace('channel-', '');
        const res = await fetch(`/api/channel?id=${channelId}`);
        const data = await res.json();

        if (res.ok && data.graphData) {
          setGraphData(prev => {
            if (!prev) return data.graphData;

            const existingNodeIds = new Set(prev.nodes.map(n => n.id));
            const newNodes = data.graphData.nodes.filter((n: GraphNode) => !existingNodeIds.has(n.id));
            const existingLinks = new Set(prev.links.map(getLinkKey));
            const newLinks = data.graphData.links.filter((l: GraphLink) => !existingLinks.has(getLinkKey(l)));

            return {
              nodes: [...prev.nodes, ...newNodes],
              links: [...prev.links, ...newLinks],
            };
          });
        }
      } else {
        const blockId = node.id.replace('block-', '');
        const existingNodeIds = graphDataRef.current?.nodes.map(n => n.id) || [];
        const exclude = existingNodeIds.filter(id => id.startsWith('channel-')).join(',');
        const res = await fetch(`/api/block-connections?id=${blockId}&exclude=${encodeURIComponent(exclude)}`);
        const data = await res.json();

        if (res.ok && data.graphData) {
          if (data.allExplored) {
            setExploredBlocks(prev => new Set(prev).add(graphNode.id));
          }

          if (data.graphData.nodes.length > 0) {
            setGraphData(prev => {
              if (!prev) return prev;
              const existing = new Set(prev.nodes.map(n => n.id));
              const newNodes = data.graphData.nodes.filter((n: GraphNode) => !existing.has(n.id));
              const existingLinks = new Set(prev.links.map(getLinkKey));
              const newLinks = data.graphData.links.filter((l: GraphLink) => !existingLinks.has(getLinkKey(l)));
              return {
                nodes: [...prev.nodes, ...newNodes],
                links: [...prev.links, ...newLinks],
              };
            });
          } else {
            setExploredBlocks(prev => new Set(prev).add(graphNode.id));
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      if (exploringTimer.current) clearTimeout(exploringTimer.current);
      exploringTimer.current = null;
      setExploring(false);
    }
  }, [selectNode]);

  const handleNodeHover = useCallback((node: any, prevNode: any) => {
    if (prevNode?.__threeObj) {
      prevNode.__threeObj.traverse((child: any) => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 0.5;
        }
        if (child.userData?.isBracket) {
          child.visible = false;
        }
      });
    }
    if (node?.__threeObj) {
      node.__threeObj.traverse((child: any) => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 1.0;
        }
        if (child.userData?.isBracket) {
          child.visible = true;
        }
      });
    }
  }, []);

  const nodeThreeObject = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    const THREE = getThree();

    if (graphNode.type === 'channel') {
      const r = graphNode.val * 0.4;
      const group = new THREE.Group();

      const geo = new THREE.SphereGeometry(r, 24, 24);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.15,
        metalness: 0.6,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        reflectivity: 1.0,
        transparent: false,
        opacity: 0.5,
      });
      group.add(new THREE.Mesh(geo, mat));

      const bracketGeo = new THREE.BufferGeometry();
      bracketGeo.setAttribute('position', new THREE.BufferAttribute(createBracketVertices(r), 3));
      const brackets = new THREE.LineSegments(bracketGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
      brackets.visible = false;
      brackets.userData.isBracket = true;
      group.add(brackets);

      return group;
    }

    if (graphNode.imageUrl) {
      const size = graphNode.val * 1.2;
      let texture = textureCache.current.get(graphNode.imageUrl);
      if (!texture) {
        const loader = new THREE.TextureLoader();
        texture = loader.load(graphNode.imageUrl);
        textureCache.current.set(graphNode.imageUrl, texture);
      }
      const group = new THREE.Group();
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 0.5,
      });
      const planeGeo = new THREE.PlaneGeometry(size, size);
      group.add(new THREE.Mesh(planeGeo, planeMat));
      group.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(planeGeo),
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
      ));
      return group;
    }

    const s = graphNode.val * 0.6;
    const geo = new THREE.BoxGeometry(s, s, s);
    const isSelected = graphNode.id === selectedNodeRef.current?.id;
    const mat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xffd93d : 0x95e1d3,
      emissive: isSelected ? 0xffd93d : 0x95e1d3,
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.5,
      transparent: false,
      opacity: 0.5,
    });
    return new THREE.Mesh(geo, mat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getNodeLabel = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    if (graphNode.type === 'channel') {
      const count = graphNode.channelData?.counts?.contents ?? graphNode.channelData?.length ?? '?';
      return `<div style="background:rgba(0,0,0,0);color:white;font-size:16px;max-width:250px;text-transform:lowercase">
        <strong><span style="font-family: var(--font-pixel)">${graphNode.name}</span></strong><br/>
        <span style="color:#4ecdc4;font-size:14px;font-family: var(--font-pixel)">${count} items</span>
      </div>`;
    }
    const block = graphNode.blockData;
    const blockType = block?.type || 'Block';
    return `<div style="background:rgba(0,0,0,0);color:white;font-size:13px;max-width:250px;font-family: var(--font-pixel)">
      <strong><span style="font-family: var(--font-pixel);text-transform: lowercase">${graphNode.name.substring(0, 40)}</span></strong><br/>
      <span style="color:#95e1d3;font-size:14px;font-family: var(--font-pixel);text-transform: lowercase">${blockType}</span>
    </div>`;
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen text-white">
        Loading...
      </div>
    );
  }

  const channelItemCount = (ch: ArenaChannel) =>
    ch.counts?.contents ?? ch.length ?? '?';

  return (
    <div className="relative w-full h-screen">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Enter Are.na URL"
            className="px-4 py-2 w-80 bg-black/50 border border-white/20 rounded-md text-white placeholder-white/50 focus:outline-none focus:border-white/50 backdrop-blur-sm font-pixel"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-md text-white backdrop-blur-sm transition-colors font-pixel uppercase"
          >
            Explore
          </button>
        </form>

        {loading && (
          <div className="text-white/70 text-sm font-pixel uppercase">Loading channel data...</div>
        )}

        {error && (
          <div className="text-red-400 text-sm font-pixel">{error}</div>
        )}

        {selectedNode && (
          <div className="w-80 bg-black/50 border border-white/20 rounded-sm backdrop-blur-sm flex flex-col transition-all">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <button
                onClick={() => setSidebarMinimized(m => !m)}
                className="text-white/50 hover:text-white text-sm font-pixel uppercase flex items-center gap-1.5"
              >
                <span className="inline-block transition-transform" style={{ transform: sidebarMinimized ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                {selectedNode.type === 'channel' ? '⁂' : '✴︎'} {selectedNode.name.substring(0, 25)}{selectedNode.name.length > 25 ? '…' : ''}
              </button>
           
            </div>

            {!sidebarMinimized && (
              <>
                {history.length > 0 && (
                  <div className="px-3 pt-2 pb-2 border-b border-white/10">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5 font-sans">Path</p>
                    <div className="flex flex-wrap gap-1 items-center">
                      {history.map((node, i) => (
                        <span key={`${node.id}-${i}`} className="flex items-center gap-1">
                          <button
                            onClick={() => jumpToHistory(i)}
                            className="text-sm px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 transition-colors truncate max-w-[100px] font-pixel"
                            style={{ color: node.type === 'channel' ? '#4ecdc4' : '#95e1d3' }}
                            title={node.name}
                          >
                            {node.type === 'channel' ? '⁂' : '✴︎'} {node.name.substring(0, 20)}{node.name.length > 20 ? '…' : ''}
                          </button>
                          <span className="text-white/20 text-[10px]">›</span>
                        </span>
                      ))}
                      <span className="text-sm text-white/80 font-pixel truncate max-w-[200px]" title={selectedNode.name}>
                        {selectedNode.type === 'channel' ? '⁂' : '✴︎'} {selectedNode.name.substring(0, 20)}{selectedNode.name.length > 20 ? '…' : ''}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-4 max-h-[60vh] overflow-y-auto">
                  {history.length > 0 && (
                    <button
                      onClick={() => jumpToHistory(history.length - 1)}
                      className="text-white/50 hover:text-white text-[10px] mb-2 flex items-center gap-1 font-sans uppercase"
                    >
                      ← Back
                    </button>
                  )}
                  <h3 className="text-white font-bold mb-2 font-pixel uppercase">
                    {selectedNode.type === 'channel' ? '⁂ Channel' : '✴︎ Block'}
                  </h3>
                  {/* <p className="text-white/80 text-sm mb-2 font-pixel uppercase">{selectedNode.name.substring(0, 20)}{selectedNode.name.length > 20 ? '…' : ''}</p> */}

                  {selectedNode.type === 'block' && selectedNode.blockData && (() => {
                    const block = selectedNode.blockData;
                    const imgSrc = block.image?.medium?.src || block.image?.small?.src || block.image?.src;
                    const text = getContentText(block);
                    const blockUrl = `https://www.are.na/block/${block.id}`;
                    return (
                      <div className="space-y-3">
                        {imgSrc && (
                          <a href={blockUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={imgSrc}
                              alt={block.title || 'Block'}
                              className="w-full border border-white/10 hover:border-white/40 transition-colors"
                            />
                          </a>
                        )}
                        {text && (
                          <>
                            <p className="text-white/70 text-sm leading-relaxed lowercase font-sans">
                              {text.substring(0, 400)}
                              {text.length > 400 ? '...' : ''}
                            </p>
                            <a
                              href={blockUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-white/60 hover:text-white/70 text-sm font-pixel lowercase underline transition-colors inline-block"
                            >
                              view original on are.na
                            </a>
                          </>
                        )}
                    
                        <p className="text-white/40 text-sm font-pixel lowercase">Type: {block.type}</p>
                        {exploredBlocks.has(selectedNode.id) && (
                          <p className="text-white/30 text-sm font-pixel italic mt-1">all connecting channels explored</p>
                        )}
                      </div>
                    );
                  })()}

                  {selectedNode.type === 'channel' && selectedNode.channelData && (
                    <div className="space-y-2">
                      <p className="text-white/60 text-sm font-pixel">
                        {channelItemCount(selectedNode.channelData)} items
                      </p>
                      <p className="text-white/40 text-sm font-pixel">
                        slug: {selectedNode.channelData.slug}
                      </p>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 border-t border-white/10">
                  <button
                    onClick={() => {
                      const prev = prevSelectedFgNodeRef.current;
                      if (prev?.type === 'block' && !prev.imageUrl && prev.__threeObj?.material?.color) {
                        prev.__threeObj.material.color.setHex(0x95e1d3);
                        prev.__threeObj.material.emissive.setHex(0x95e1d3);
                      }
                      prevSelectedFgNodeRef.current = null;
                      setSelectedNode(null); setHistory([]); setSidebarMinimized(false);
                    }}
                    className="text-white/30 hover:text-white/60 transition-colors text-sm font-pixel uppercase w-full text-center"
                  >
                    clear history
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!loading && graphData && (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={getNodeLabel}
          linkColor={() => '#d6d6d6'}
          linkWidth={0.5}
          linkOpacity={0.5}
          backgroundColor="#0a0a0a"
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          controlType="orbit"
          enablePointerInteraction={true}
          showNavInfo={false}
        />
      )}

      {exploring && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 animate-pulse rounded-none bg-white/30"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-white/40 font-pixel text-center">
        <p>Drag to rotate ✴︎ Shift-drag or right-drag to pan ✴︎ Scroll to zoom</p>
      </div>
    </div>
  );
}
