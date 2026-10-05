'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface Star {
  id: number;
  x: number;
  y: number;
  char: string;
  size: number;
}

const STAR_CHARS = ['·', '·', '·', '✦', '⋆'];
const STAR_COUNT = 42;
const MIN_DISTANCE = 7; // minimum % distance between stars

function generateStars(): Star[] {
  const stars: Star[] = [];
  let attempts = 0;

  while (stars.length < STAR_COUNT && attempts < 500) {
    const x = 5 + Math.random() * 90;
    const y = 5 + Math.random() * 90;

    // Check minimum distance from existing stars
    const tooClose = stars.some((s) => {
      const dx = s.x - x;
      const dy = s.y - y;
      return Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE;
    });

    if (!tooClose) {
      stars.push({
        id: stars.length,
        x,
        y,
        char: STAR_CHARS[Math.floor(Math.random() * STAR_CHARS.length)],
        size: 8 + Math.random() * 12,
      });
    }
    attempts++;
  }

  return stars;
}

export default function ConstellationCanvas() {
  const [stars, setStars] = useState<Star[]>([]);
  const [constellations, setConstellations] = useState<number[][]>([]);
  const [activeConstellation, setActiveConstellation] = useState<number[]>([]);

  useEffect(() => {
    setStars(generateStars());
  }, []);

  // Set of star IDs that are part of any constellation (for visual highlighting)
  const connectedStarIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of constellations) {
      for (const id of c) ids.add(id);
    }
    for (const id of activeConstellation) ids.add(id);
    return ids;
  }, [constellations, activeConstellation]);

  // Clicking empty canvas finalizes the active constellation
  const handleCanvasClick = useCallback(() => {
    if (activeConstellation.length >= 2) {
      setConstellations((prev) => [...prev, activeConstellation]);
    }
    setActiveConstellation([]);
  }, [activeConstellation]);

  const handleStarClick = useCallback(
    (e: React.MouseEvent, starId: number) => {
      e.stopPropagation();

      if (activeConstellation.length === 0) {
        setActiveConstellation([starId]);
        return;
      }

      // Ignore if star is already in the active constellation
      if (activeConstellation.includes(starId)) return;

      // Add star to active constellation
      setActiveConstellation((prev) => [...prev, starId]);
    },
    [activeConstellation]
  );

  const starMap = useMemo(() => {
    const map = new Map<number, Star>();
    for (const s of stars) map.set(s.id, s);
    return map;
  }, [stars]);

  const renderLines = (starIds: number[]) => {
    const lines = [];
    for (let i = 0; i < starIds.length - 1; i++) {
      const a = starMap.get(starIds[i]);
      const b = starMap.get(starIds[i + 1]);
      if (!a || !b) continue;
      lines.push(
        <line
          key={`${starIds[i]}-${starIds[i + 1]}-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#b9b2ca"
          strokeWidth="0.75"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    return lines;
  };

  if (stars.length === 0) return null;

  return (
    <div className="relative w-full h-full" onClick={handleCanvasClick}>
      {/* SVG overlay for constellation lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {constellations.map((c, i) => (
          <g key={i}>{renderLines(c)}</g>
        ))}
        {activeConstellation.length >= 2 && (
          <g>{renderLines(activeConstellation)}</g>
        )}
      </svg>

      {stars.map((star) => {
        const isConnected = connectedStarIds.has(star.id);
        const isActive =
          activeConstellation.length > 0 &&
          activeConstellation[activeConstellation.length - 1] === star.id;

        return (
          <div
            key={star.id}
            className="absolute"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              className={`star relative block cursor-pointer select-none transition-[transform,color] duration-200 hover:scale-150 ${
                isConnected ? 'text-white' : 'text-white/50'
              } ${isActive ? 'scale-125' : ''}`}
              style={{ fontSize: `${star.size}px` }}
              onClick={(e) => handleStarClick(e, star.id)}
            >
              {star.char}
            </span>
          </div>
        );
      })}
    </div>
  );
}
