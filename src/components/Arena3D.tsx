'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Info } from '@geist-ui/icons';

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
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
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
      const key = e.key.toLowerCase();
      keysPressed.current.add(key);
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
    const THREE = getThree();
    const tick = () => {
      const fg = fgRef.current;
      if (!fg) { animId = requestAnimationFrame(tick); return; }
      const camera = fg.camera();
      const controls = fg.controls();
      const keys = keysPressed.current;
      if (keys.size === 0) { animId = requestAnimationFrame(tick); return; }

      const moveSpeed = keys.has('shift') ? 8 : 3;

      const dir = camera.getWorldDirection(new THREE.Vector3());
      const right = dir.clone().cross(camera.up).normalize();
      const up = camera.up.clone().normalize();

      // Translation DOF via keyboard:
      // - WASD: pan in screen space (left/right/up/down)
      // - Q/E: dolly in/out along view direction
      if (controls && (controls as any).target) {
        const target = (controls as any).target as typeof camera.position;
        const panOffset = new THREE.Vector3();
        const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize();
        const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).normalize();

        if (keys.has('a')) panOffset.addScaledVector(camRight, -moveSpeed);
        if (keys.has('d')) panOffset.addScaledVector(camRight, moveSpeed);
        if (keys.has('w')) panOffset.addScaledVector(camUp, moveSpeed);
        if (keys.has('s')) panOffset.addScaledVector(camUp, -moveSpeed);

        if (!panOffset.equals(new THREE.Vector3(0, 0, 0))) {
          camera.position.add(panOffset);
          target.add(panOffset);
        }

        if (keys.has('q') || keys.has('e')) {
          const dollyDir = camera.getWorldDirection(new THREE.Vector3());
          const dollyAmount = keys.has('q') ? -moveSpeed : moveSpeed;
          const dollyOffset = dollyDir.multiplyScalar(dollyAmount);
          camera.position.add(dollyOffset);
          target.add(dollyOffset);
        }
      } else {
        // Fallback if controls/target are unavailable: move camera in local axes
        if (keys.has('w')) camera.position.addScaledVector(up, moveSpeed);
        if (keys.has('s')) camera.position.addScaledVector(up, -moveSpeed);
        if (keys.has('a')) camera.position.addScaledVector(right, -moveSpeed);
        if (keys.has('d')) camera.position.addScaledVector(right, moveSpeed);
        if (keys.has('q')) camera.position.addScaledVector(dir, -moveSpeed);
        if (keys.has('e')) camera.position.addScaledVector(dir, moveSpeed);
      }

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

  const fetchUserData = useCallback(async (username: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/user?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch user data');
        setGraphData(null);
        return;
      }

      setGraphData(data.graphData);
      setSelectedNode(null);
      setHistory([]);
      setExploredBlocks(new Set());
    } catch (err) {
      setError('Failed to fetch user data');
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
      if (initialSlug.startsWith('@')) {
        fetchUserData(initialSlug.slice(1));
      } else {
        fetchData(initialSlug);
      }
    }
  }, [initialSlug, fetchData, fetchUserData]);

  const extractInput = (input: string): { type: 'channel' | 'user'; value: string } => {
    const trimmed = input.trim();

    // Handle @username shorthand
    if (trimmed.startsWith('@')) {
      return { type: 'user', value: trimmed.slice(1) };
    }

    try {
      const url = new URL(trimmed);
      if (url.hostname.endsWith('are.na')) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length === 1) {
          // are.na/username — profile URL
          return { type: 'user', value: segments[0] };
        }
        if (segments.length === 2 && segments[1] === 'channels') {
          // are.na/username/channels — profile channels page
          return { type: 'user', value: segments[0] };
        }
        // are.na/username/channel-slug — channel URL
        return { type: 'channel', value: segments[segments.length - 1] || '' };
      }
    } catch {
      // not a URL — treat as a raw channel slug
    }
    return { type: 'channel', value: trimmed.replace(/^-/, '') };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = extractInput(slug);
    if (!parsed.value) return;

    if (parsed.type === 'user') {
      router.push(`/explore?slug=${encodeURIComponent('@' + parsed.value)}`);
      fetchUserData(parsed.value);
    } else {
      router.push(`/explore?slug=${encodeURIComponent(parsed.value)}`);
      fetchData(parsed.value);
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

  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault();
    const graphNode = node as GraphNode;

    setGraphData(prev => {
      if (!prev) return prev;

      // Find parent IDs (nodes that link TO this node)
      const parentIds = new Set<string>();
      for (const link of prev.links) {
        const target = typeof link.target === 'object' ? (link.target as any).id : link.target;
        const source = typeof link.source === 'object' ? (link.source as any).id : link.source;
        if (target === graphNode.id) parentIds.add(source);
      }

      // BFS to collect all descendants (excluding parents)
      const toRemove = new Set<string>([graphNode.id]);
      const queue = [graphNode.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const link of prev.links) {
          const source = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const target = typeof link.target === 'object' ? (link.target as any).id : link.target;
          // Follow links outward from current, but don't traverse back to parents of the original node
          if (source === current && !toRemove.has(target) && !parentIds.has(target)) {
            toRemove.add(target);
            queue.push(target);
          }
          if (target === current && !toRemove.has(source) && !parentIds.has(source)) {
            toRemove.add(source);
            queue.push(source);
          }
        }
      }

      return {
        nodes: prev.nodes.filter(n => !toRemove.has(n.id)),
        links: prev.links.filter(l => {
          const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
          const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
          return !toRemove.has(s) && !toRemove.has(t);
        }),
      };
    });

    // Clear selection if the removed node was selected
    if (selectedNode?.id === graphNode.id) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const handleNodeHover = useCallback((node: any, prevNode: any) => {
    if (prevNode?.__threeObj) {
      prevNode.__threeObj.traverse((child: any) => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 0.5;
        }
      });
    }
    if (node?.__threeObj) {
      node.__threeObj.traverse((child: any) => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 1.0;
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
      const matOptions: any = {
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
      };

      if (graphNode.previewUrl) {
        let texture = textureCache.current.get(graphNode.previewUrl);
        if (!texture) {
          const loader = new THREE.TextureLoader();
          texture = loader.load(graphNode.previewUrl);
          textureCache.current.set(graphNode.previewUrl, texture);
        }
        matOptions.map = texture;
        matOptions.emissiveIntensity = 0.05;
      }

      const mat = new THREE.MeshPhysicalMaterial(matOptions);
      group.add(new THREE.Mesh(geo, mat));

      // Brackets always visible to distinguish channels from blocks
      const bracketGeo = new THREE.BufferGeometry();
      bracketGeo.setAttribute('position', new THREE.BufferAttribute(createBracketVertices(r), 3));
      const brackets = new THREE.LineSegments(bracketGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
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
      const mesh = new THREE.Mesh(planeGeo, planeMat);
      mesh.onBeforeRender = (_renderer: any, _scene: any, camera: any) => {
        group.quaternion.copy(camera.quaternion);
      };
      group.add(mesh);
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
    <div className="relative w-full h-screen" onContextMenu={(e) => e.preventDefault()}>
      <div className={`absolute z-10 flex flex-col gap-2 transition-all duration-700 ease-in-out ${
        graphData || loading ? 'top-4 left-4' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
      }`}>
        <form onSubmit={handleSubmit} className={`flex gap-2 transition-transform duration-700 ${
          graphData || loading ? '' : 'scale-110'
        }`}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Enter Are.na channel or profile URL"
            className="px-3 py-1 w-80 bg-black/50 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/50 backdrop-blur-sm font-pixel"
          />
          <button
            type="submit"
            className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-sm transition-colors font-pixel uppercase"
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
          <div className="w-80 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar bg-black/50 border border-white/20 rounded-sm backdrop-blur-sm flex flex-col transition-all">
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
                    <button
                      onClick={() => setHistoryCollapsed(h => !h)}
                      className="text-white/40 hover:text-white/60 text-[10px] uppercase tracking-wider mb-1.5 font-sans flex items-center gap-1 transition-colors"
                    >
                      <span className="inline-block transition-transform" style={{ transform: historyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                      Path ({history.length})
                    </button>
                    {!historyCollapsed && (
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
                    )}
                  </div>
                )}

                <div className="p-4">
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
                    const rich =
                      block.content && typeof block.content !== 'string'
                        ? (block.content as any).html
                        : null;

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

                        {rich ? (
                          <div
                            className="text-white/70 text-sm leading-relaxed lowercase font-sans space-y-2"
                            dangerouslySetInnerHTML={{ __html: rich }}
                          />
                        ) : (
                          text && (
                            <p className="text-white/70 text-sm leading-relaxed lowercase font-sans">
                              {text}
                            </p>
                          )
                        )}

                        {(rich || text) && (
                          <a
                            href={blockUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/60 hover:text-white/70 text-sm font-pixel lowercase underline transition-colors inline-block"
                          >
                            view original on are.na
                          </a>
                        )}

                        <p className="text-white/40 text-sm font-pixel lowercase">Type: {block.type}</p>
                        {exploredBlocks.has(selectedNode.id) && (
                          <p className="text-white/30 text-sm font-pixel italic mt-1">
                            all connecting channels explored
                          </p>
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

      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setControlsOpen((open) => !open)}
          className="flex items-center gap-1 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/20 text-white text-xs font-pixel uppercase backdrop-blur-sm transition-colors"
        >
          <Info size={14} />
          Controls
        </button>

        {controlsOpen && (
          <div className="w-80 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar bg-black/50 border border-white/20 rounded-sm backdrop-blur-sm flex flex-col transition-all">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="text-white/70 text-xs font-pixel uppercase tracking-wide">
                Controls
              </div>
              <button
                type="button"
                onClick={() => setControlsOpen(false)}
                className="text-white/40 hover:text-white/80 text-xs font-pixel uppercase tracking-wide"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div>
                <p className="text-white/60 font-pixel uppercase mb-1">Mouse</p>
                <p className="text-white/70 font-sans lowercase">
                  drag to rotate • shift-drag or right-drag to pan • scroll to zoom
                </p>
              </div>
              <div>
                <p className="text-white/60 font-pixel uppercase mb-1">Keyboard movement</p>
                <p className="text-white/70 font-sans lowercase">
                  wasd: pan the view in screen space • q / e: zoom in / out along view
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] font-pixel uppercase tracking-wide">
                  tip
                </p>
                <p className="text-white/50 text-[11px] font-sans lowercase">
                  hold shift while using keys to move and rotate faster.
                </p>
              </div>
            </div>
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
          onNodeRightClick={handleNodeRightClick}
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
    </div>
  );
}
