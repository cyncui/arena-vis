'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import InterfaceIcon from './InterfaceIcon';
import NavigationGuide from './NavigationGuide';
import HandControlsPanel from './HandControlsPanel';
import { applyHandMotion, pickHandNode, type HandGraphHit, type HandGraphControls } from '@/lib/hand-controls/graph-adapter';
import type { HandOutput } from '@/lib/hand-controls/types';
import { HoverSelectionController } from '@/lib/hand-controls/hover-selection';

import * as THREE from 'three';

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
  source: string | GraphNode;
  target: string | GraphNode;
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

function getLinkKey(link: GraphLink): string {
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  return `${s}__${t}`;
}

const clusterPalette = ['#b8a7d4', '#8fb7b0', '#cfb38e', '#a4afc9'];
const selectedParticleColor = '#fff0cf';

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function setParticleColor(node: any, color: string) {
  const object = node?.__threeObj || node;
  object?.traverse?.((child: any) => {
    if (child.userData.isParticle || child.userData.isImageEdge) child.material.color.set(color);
  });
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
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(!!initialSlug);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [history, setHistory] = useState<GraphNode[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [exploredBlocks, setExploredBlocks] = useState<Set<string>>(new Set());
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [exploring, setExploring] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [handHoveredNodeName, setHandHoveredNodeName] = useState<string | null>(null);
  const handHoverRef = useRef<HandGraphHit | null>(null);
  const handHoverSelectionRef = useRef(new HoverSelectionController());
  const handHoverProgressRef = useRef(0);
  const handCameraControlsRef = useRef<{ controls: HandGraphControls; enabled: boolean; damping: boolean } | null>(null);
  const [randomState, setRandomState] = useState<'idle' | 'loading'>('idle');
  const exploringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textureCache = useRef<Map<string, any>>(new Map());
  const keysPressed = useRef<Set<string>>(new Set());
  const selectedNodeRef = useRef<GraphNode | null>(null);
  const prevSelectedFgNodeRef = useRef<any>(null);
  const graphDataRef = useRef<GraphData | null>(null);
  const nodeColors = useMemo(() => {
    const colors = new Map<string, string>();
    if (!graphData) return colors;
    const channels = new Set(graphData.nodes.filter(node => node.type === 'channel').map(node => node.id));
    for (const id of channels) colors.set(id, clusterPalette[hashId(id) % clusterPalette.length]);
    const owners = new Map<string, string>();
    for (const link of graphData.links) {
      const source = typeof link.source === 'object' ? link.source.id : link.source;
      const target = typeof link.target === 'object' ? link.target.id : link.target;
      for (const [channel, block] of [[source, target], [target, source]]) {
        if (!channels.has(channel) || channels.has(block)) continue;
        const owner = owners.get(block);
        if (!owner || channel < owner) owners.set(block, channel);
      }
    }
    for (const node of graphData.nodes) {
      if (!colors.has(node.id)) colors.set(node.id, colors.get(owners.get(node.id) || '') || clusterPalette[0]);
    }
    return colors;
  }, [graphData]);
  const nodeColorsRef = useRef(nodeColors);
  nodeColorsRef.current = nodeColors;

  useEffect(() => {
    for (const node of graphData?.nodes || []) {
      setParticleColor(node, node.id === selectedNode?.id || node.id === handHoverRef.current?.id ? selectedParticleColor : nodeColors.get(node.id) || clusterPalette[0]);
    }
  }, [graphData, nodeColors, selectedNode]);

  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);

  useEffect(() => {
    let animId: number | null = null;
    const movementKeys = new Set(['w', 'a', 's', 'd', 'q', 'e']);
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const hasMovement = () => [...keysPressed.current].some(key => movementKeys.has(key));
    const tick = () => {
      animId = null;
      if (!hasMovement()) return;
      const fg = fgRef.current;
      if (fg) {
        const camera = fg.camera();
        const controls = fg.controls();
        const keys = keysPressed.current;
        const speed = keys.has('shift') ? 8 : 3;
        camera.getWorldDirection(direction);
        right.setFromMatrixColumn(camera.matrix, 0).normalize();
        up.setFromMatrixColumn(camera.matrix, 1).normalize();
        offset.set(0, 0, 0);
        if (keys.has('a')) offset.addScaledVector(right, -speed);
        if (keys.has('d')) offset.addScaledVector(right, speed);
        if (keys.has('w')) offset.addScaledVector(up, speed);
        if (keys.has('s')) offset.addScaledVector(up, -speed);
        if (keys.has('q')) offset.addScaledVector(direction, -speed);
        if (keys.has('e')) offset.addScaledVector(direction, speed);
        camera.position.add(offset);
        controls?.target?.add(offset);
      }
      animId = requestAnimationFrame(tick);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (!movementKeys.has(key) && key !== 'shift') return;
      keysPressed.current.add(key);
      if (key === 'shift') {
        const controls = fgRef.current?.controls();
        if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      }
      if (movementKeys.has(key) && animId === null) animId = requestAnimationFrame(tick);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
      if (e.key === 'Shift') {
        const controls = fgRef.current?.controls();
        if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
      if (!hasMovement() && animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };
    const onBlur = () => {
      keysPressed.current.clear();
      if (animId !== null) cancelAnimationFrame(animId);
      animId = null;
      const controls = fgRef.current?.controls();
      if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      onBlur();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      const fg = fgRef.current;
      if (!fg) return;
      if (document.hidden) fg.pauseAnimation();
      else fg.resumeAnimation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const galaxyCleanup = useRef<(() => void) | null>(null);
  const attachGraph = useCallback((fg: any) => {
    galaxyCleanup.current?.();
    galaxyCleanup.current = null;
    fgRef.current = fg;
    if (!fg) return;
    if (document.hidden) fg.pauseAnimation();
    const scene = fg.scene();
    const count = 350;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let seed = 731;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      if (i < 260) {
        const radius = 250 + Math.sqrt(random()) * 1700;
        const angle = radius * 0.003 + (i % 3) * Math.PI * 2 / 3 + (random() - 0.5) * 0.55;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (random() - 0.5) * 150 - radius * 0.18;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
      } else {
        const angle = random() * Math.PI * 2;
        const height = random() * 2 - 1;
        const radius = 2300 + random() * 1000;
        const ring = Math.sqrt(1 - height * height) * radius;
        positions[i * 3] = Math.cos(angle) * ring;
        positions[i * 3 + 1] = height * radius;
        positions[i * 3 + 2] = Math.sin(angle) * ring;
      }
      color.set(i % 5 === 0 ? '#aaa8cf' : '#ded8cb').multiplyScalar(0.12 + random() * 0.16);
      color.toArray(colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.9,
      sizeAttenuation: false,
      vertexColors: true,
      depthWrite: false,
    });
    const galaxy = new THREE.Points(geometry, material);
    scene.add(galaxy);
    galaxyCleanup.current = () => {
      scene.remove(galaxy);
      geometry.dispose();
      material.dispose();
    };
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
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    setMounted(true);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
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
    if (randomState === 'loading' || loading) return;
    const parsed = extractInput(slug);
    if (!parsed.value) return;

    const nextSlug = parsed.type === 'user' ? '@' + parsed.value : parsed.value;
    if (nextSlug === initialSlug) {
      if (parsed.type === 'user') fetchUserData(parsed.value);
      else fetchData(parsed.value);
    } else {
      router.push(`/explore?slug=${encodeURIComponent(nextSlug)}`);
    }
  };

  const handleRandomChannel = async () => {
    if (randomState === 'loading' || loading) return;
    setRandomState('loading');
    setError(null);
    try {
      const response = await fetch('/api/random-channel', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'could not find a followed channel. please try again.');
        return;
      }
      if (typeof data.channel?.slug !== 'string' || !data.channel.slug.trim()) {
        setError('could not find a followed channel. please try again.');
        return;
      }
      setSlug(data.channel.slug);
      if (data.channel.slug === initialSlug) {
        await fetchData(data.channel.slug);
      } else {
        router.push(`/explore?slug=${encodeURIComponent(data.channel.slug)}`);
      }
    } catch {
      setError('could not find a followed channel. please try again.');
    } finally {
      setRandomState('idle');
    }
  };

  const selectNode = useCallback((node: GraphNode) => {
    setSidebarMinimized(false);
    setHistoryCollapsed(true);
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
    setHistoryCollapsed(true);
    const prev = prevSelectedFgNodeRef.current;
    if (prev) setParticleColor(prev, nodeColorsRef.current.get(prev.id) || clusterPalette[0]);
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
    if (prev) setParticleColor(prev, nodeColorsRef.current.get(prev.id) || clusterPalette[0]);
    setParticleColor(node, selectedParticleColor);
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
    for (const [target, opacity] of [[prevNode, 0.4], [node, 0.8]]) {
      target?.__threeObj?.traverse((child: any) => {
        if (child.userData.isImageEdge) child.material.opacity = opacity;
      });
    }
  }, []);

  const nodeThreeObject = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    const color = graphNode.id === selectedNodeRef.current?.id
      ? selectedParticleColor
      : nodeColorsRef.current.get(graphNode.id) || clusterPalette[0];

    if (graphNode.type === 'channel') {
      const r = Math.min(3.2, Math.max(1.8, graphNode.val * 0.16));
      const group = new THREE.Group();
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      particle.userData.isParticle = true;
      group.add(particle);

      const bracketGeo = new THREE.BufferGeometry();
      bracketGeo.setAttribute('position', new THREE.BufferAttribute(createBracketVertices(r), 3));
      const brackets = new THREE.LineSegments(bracketGeo, new THREE.LineBasicMaterial({
        color: '#b8b6c3', opacity: 0.35, transparent: true,
      }));
      brackets.userData.isBracket = true;
      group.add(brackets);
      group.userData.handNodeId = graphNode.id;
      return group;
    }

    if (graphNode.imageUrl) {
      const size = Math.min(9, Math.max(4, graphNode.val * 0.7));
      let texture = textureCache.current.get(graphNode.imageUrl);
      if (!texture) {
        texture = new THREE.TextureLoader().load(graphNode.imageUrl);
        textureCache.current.set(graphNode.imageUrl, texture);
      }
      const group = new THREE.Group();
      const planeMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      const planeGeo = new THREE.PlaneGeometry(size, size);
      const mesh = new THREE.Mesh(planeGeo, planeMat);
      mesh.onBeforeRender = (_renderer: any, _scene: any, camera: any) => {
        group.quaternion.copy(camera.quaternion);
      };
      group.add(mesh);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(planeGeo),
        new THREE.LineBasicMaterial({ color, opacity: 0.4, transparent: true })
      );
      edge.userData.isImageEdge = true;
      group.add(edge);
      group.userData.handNodeId = graphNode.id;
      group.userData.handImage = true;
      return group;
    }

    const r = Math.min(1.6, Math.max(1.1, graphNode.val * 0.2));
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    particle.userData.isParticle = true;
    particle.userData.handNodeId = graphNode.id;
    return particle;
  }, []);

  const getLinkColor = useCallback((link: any) => {
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;
    const color = nodeColorsRef.current.get(source) || nodeColorsRef.current.get(target) || clusterPalette[0];
    return new THREE.Color(color).multiplyScalar(0.32).getStyle();
  }, []);

  const getLinkCurveRotation = useCallback((link: any) =>
    hashId(getLinkKey(link)) / 4294967296 * Math.PI * 2, []);

  const resetHandControls = useCallback(() => {
    const previous = handHoverRef.current;
    if (previous) {
      setParticleColor(previous.object, previous.id === selectedNodeRef.current?.id
        ? selectedParticleColor : nodeColorsRef.current.get(previous.id) || clusterPalette[0]);
    }
    handHoverRef.current = null;
    handHoverSelectionRef.current.reset();
    handHoverProgressRef.current = 0;
    setHandHoveredNodeName(null);
    const captured = handCameraControlsRef.current;
    if (captured) {
      captured.controls.enabled = captured.enabled;
      captured.controls.enableDamping = captured.damping;
      handCameraControlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    resetHandControls();
    return resetHandControls;
  }, [initialSlug, loading, resetHandControls]);

  const handleHandOutput = useCallback((output: HandOutput) => {
    const fg = fgRef.current;
    if (!fg || loading || !graphDataRef.current) {
      resetHandControls();
      return;
    }
    const controls = fg.controls() as HandGraphControls;
    if (output.motion) {
      if (!handCameraControlsRef.current) {
        handCameraControlsRef.current = { controls, enabled: controls.enabled, damping: controls.enableDamping };
        controls.enabled = false;
        controls.enableDamping = false;
        controls.update();
      }
      applyHandMotion(fg.camera(), controls, output.motion, viewport);
    } else if (handCameraControlsRef.current) {
      const captured = handCameraControlsRef.current;
      captured.controls.enabled = captured.enabled;
      captured.controls.enableDamping = captured.damping;
      handCameraControlsRef.current = null;
    }
    const pick = (point: { x: number; y: number } | null) => {
      if (!point || document.elementFromPoint(point.x, point.y)?.closest('[data-hand-ui]')) return null;
      return pickHandNode(fg.scene(), fg.camera(), point, viewport);
    };
    const hit = pick(output.cursor);
    if (hit?.id !== handHoverRef.current?.id) {
      const previous = handHoverRef.current;
      if (previous) {
        setParticleColor(previous.object, previous.id === selectedNodeRef.current?.id
          ? selectedParticleColor : nodeColorsRef.current.get(previous.id) || clusterPalette[0]);
      }
      handHoverRef.current = hit;
      const node = graphDataRef.current.nodes.find(node => node.id === hit?.id);
      setHandHoveredNodeName(node?.name || null);
      if (hit) setParticleColor(hit.object, selectedParticleColor);
    }
    if (output.gesture !== 'aiming' || output.motion || !output.cursor) {
      handHoverSelectionRef.current.cancel(hit?.id || null);
      handHoverProgressRef.current = 0;
      return;
    }
    const selection = handHoverSelectionRef.current.step(hit?.id || null, performance.now());
    handHoverProgressRef.current = selection.progress;
    if (selection.select) {
      const node = graphDataRef.current.nodes.find(node => node.id === selection.select);
      if (node) void handleNodeClick(node);
    }
  }, [handleNodeClick, loading, resetHandControls, viewport]);

  const getNodeLabel = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    if (graphNode.type === 'channel') {
      const count = graphNode.channelData?.counts?.contents ?? graphNode.channelData?.length ?? '?';
      return `<div style="background:rgba(0,0,0,0);color:white;font-size:16px;max-width:250px;text-transform:lowercase">
        <strong><span style="font-family: var(--font-pixel)">${graphNode.name}</span></strong><br/>
        <span style="color:${nodeColorsRef.current.get(graphNode.id) || clusterPalette[0]};font-size:14px;font-family: var(--font-pixel)">${count} items</span>
      </div>`;
    }
    const block = graphNode.blockData;
    const blockType = block?.type || 'Block';
    return `<div style="background:rgba(0,0,0,0);color:white;font-size:13px;max-width:250px;font-family: var(--font-pixel)">
      <strong><span style="font-family: var(--font-pixel);text-transform: lowercase">${graphNode.name.substring(0, 40)}</span></strong><br/>
      <span style="color:${nodeColorsRef.current.get(graphNode.id) || clusterPalette[0]};font-size:14px;font-family: var(--font-pixel);text-transform: lowercase">${blockType}</span>
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
    <div className="relative w-full h-[100dvh]" onContextMenu={(e) => e.preventDefault()}>
      <div data-hand-ui className={`absolute z-10 max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-10rem)] flex flex-col gap-2 transition-all duration-700 ease-in-out ${
        graphData || loading ? 'top-4 left-4' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
      }`}>
        <form onSubmit={handleSubmit} className={`grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 transition-transform duration-700 ${
          graphData || loading ? '' : 'md:scale-110'
        }`}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Enter Are.na channel or profile URL"
            className="px-3 py-1 w-80 min-w-0 max-w-full bg-black/50 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/50 backdrop-blur-sm font-pixel"
          />
          <button
            type="submit"
            disabled={randomState === 'loading' || loading}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-sm transition-colors font-pixel uppercase disabled:opacity-50 disabled:cursor-wait"
          >
            Explore
          </button>
          <button
            type="button"
            onClick={handleRandomChannel}
            disabled={randomState === 'loading' || loading}
            title="random channel followed by cynthia"
            className="justify-self-start px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-sm transition-colors font-pixel uppercase disabled:opacity-50 disabled:cursor-wait"
          >
            Random
          </button>
        </form>

        {randomState === 'loading' && (
          <div role="status" className="text-white/70 text-sm font-pixel uppercase">finding channel...</div>
        )}

        {loading && (
          <div className="text-white/70 text-sm font-pixel uppercase">Loading channel data...</div>
        )}

        {error && (
          <div role="alert" className="text-red-400 text-sm font-pixel">{error}</div>
        )}

        {selectedNode && (
          <div className="w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar bg-black/50 border border-white/20 rounded-sm backdrop-blur-sm flex flex-col transition-all">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <button
                onClick={() => setSidebarMinimized(m => !m)}
                aria-expanded={!sidebarMinimized}
                className="text-white/50 hover:text-white text-sm font-pixel uppercase flex items-center gap-1.5"
              >
                <InterfaceIcon name="chevron-down" className="transition-transform" style={{ transform: sidebarMinimized ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                <InterfaceIcon name={selectedNode.type === 'channel' ? 'channel' : 'block'} />
                {selectedNode.name.substring(0, 25)}{selectedNode.name.length > 25 ? '…' : ''}
              </button>
           
            </div>

            {!sidebarMinimized && (
              <>
                {history.length > 0 && (
                  <div className="px-3 pt-2 pb-2 border-b border-white/10">
                    <button
                      onClick={() => setHistoryCollapsed(h => !h)}
                      aria-expanded={!historyCollapsed}
                      className="text-white/40 hover:text-white/60 text-[10px] uppercase tracking-wider mb-1.5 font-sans flex items-center gap-1 transition-colors"
                    >
                      <InterfaceIcon name="chevron-down" className="transition-transform" style={{ transform: historyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                      Path ({history.length})
                    </button>
                    {!historyCollapsed && (
                      <div className="flex flex-wrap gap-1 items-center">
                        {history.map((node, i) => (
                          <span key={`${node.id}-${i}`} className="flex items-center gap-1">
                            <button
                              onClick={() => jumpToHistory(i)}
                              className="text-sm px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 transition-colors flex items-center gap-1 max-w-[100px] font-pixel"
                              style={{ color: nodeColors.get(node.id) || clusterPalette[0] }}
                              title={node.name}
                            >
                              <InterfaceIcon name={node.type === 'channel' ? 'channel' : 'block'} />
                              <span className="min-w-0 truncate">{node.name.substring(0, 20)}{node.name.length > 20 ? '…' : ''}</span>
                            </button>
                            <InterfaceIcon name="chevron-right" className="text-white/20" />
                          </span>
                        ))}
                        <span className="text-sm text-white/80 font-pixel flex items-center gap-1 max-w-[200px]" title={selectedNode.name}>
                          <InterfaceIcon name={selectedNode.type === 'channel' ? 'channel' : 'block'} />
                          <span className="min-w-0 truncate">{selectedNode.name.substring(0, 20)}{selectedNode.name.length > 20 ? '…' : ''}</span>
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
                      <InterfaceIcon name="arrow-left" />
                      Back
                    </button>
                  )}
                  <h3 className="text-white font-bold mb-2 font-pixel uppercase flex items-center gap-1.5">
                    <InterfaceIcon name={selectedNode.type === 'channel' ? 'channel' : 'block'} />
                    {selectedNode.type === 'channel' ? 'Channel' : 'Block'}
                  </h3>

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
                      if (prev) setParticleColor(prev, nodeColorsRef.current.get(prev.id) || clusterPalette[0]);
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

      <div data-hand-ui className="absolute top-16 sm:top-4 bottom-4 right-4 z-10 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setControlsOpen((open) => !open)}
          aria-expanded={controlsOpen}
          className="pointer-events-auto shrink-0 flex items-center gap-1 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/20 text-white text-xs font-pixel uppercase backdrop-blur-sm transition-colors"
        >
          <InterfaceIcon name="orbit" />
          Controls
        </button>

        {controlsOpen && (
          <div className="min-h-0 overflow-y-auto custom-scrollbar pointer-events-auto">
            <NavigationGuide onClose={() => setControlsOpen(false)} />
          </div>
        )}
        <div className="mt-auto shrink-0 pointer-events-auto">
          <HandControlsPanel
            viewport={viewport}
            graphKey={initialSlug}
            available={!loading && !!graphData && viewport.width >= 768}
            hoveredNodeName={handHoveredNodeName}
            hoverProgressRef={handHoverProgressRef}
            onOutput={handleHandOutput}
            onReset={resetHandControls}
          />
        </div>
      </div>

      {!loading && graphData && (
        <ForceGraph3D
          ref={attachGraph as any}
          width={viewport.width}
          height={viewport.height}
          graphData={graphData}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={getNodeLabel}
          linkColor={getLinkColor}
          linkCurvature={0.16}
          linkCurveRotation={getLinkCurveRotation}
          linkWidth={0}
          linkOpacity={1}
          cooldownTicks={120}
          backgroundColor="#030406"
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
