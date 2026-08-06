// src/BreadthTab.jsx
// Breadth tab: RSP/SPY ratio from /api/breadth. Dependency-free SVG chart.
//
// Colors come from CSS custom properties with dark-terminal fallbacks, so it
// picks up the terminal theme if these variables exist:
//   --term-bg, --term-fg, --term-muted, --term-accent, --term-up, --term-down, --term-grid
//
// Polls every 30s (matches the server's cache TTL, so polling faster buys nothing).
// Fails visibly: a 502 from the API renders an explicit error state.

import { useEffect, useRef, useState } from 'react';

const POLL_MS = 30_000;
const W = 920, H = 380, PAD = { t: 16, r: 64, b: 28, l: 12 };

const css = (name, fallback) =>
  `var(${name}, ${fallback})`;

const C = {
  bg: css('--term-bg', '#0b0e14'),
  fg: css('--term-fg', '#d8dee9'),
  muted: css('--term-muted', '#6b7280'),
  accent: css('--term-accent', '#e8b64c'),   // ratio line
  up: css('--term-up', '#4cc38a'),
  down: css('--term-down', '#e5534b'),
  grid: css('--term-grid', '#1f2430'),
  dma50: '#5e9bd6',
  dma200: '#b07cd6',
};

export default function BreadthTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null); // index into series
  const timer = useRef(null);

  const load = async () => {
    try {
      const r = await fetch('/api/breadth');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e.message); // keep last good data on screen if we have it
    }
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, []);

  if (!data && !error) return <Panel><Msg color={C.muted}>loading breadth…</Msg></Panel>;
  if (!data && error) return <Panel><Msg color={C.down}>breadth data unavailable: {error}</Msg></Panel>;

  const { series, last, dma50, dma200, levels, regime, direction } = data;

  // --- scales ---
  const pts = series.filter(p => p.ratio != null);
  const ys = [
    ...pts.map(p => p.ratio),
    ...Object.values(levels),
    ...pts.map(p => p.dma50).filter(v => v != null),
    ...pts.map(p => p.dma200).filter(v => v != null),
  ];
  const yMin = Math.min(...ys) * 0.999, yMax = Math.max(...ys) * 1.001;
  const x = i => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = v => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const path = (get) => {
    let d = '';
    pts.forEach((p, i) => {
      const v = get(p);
      if (v == null) return;
      d += (d ? ' L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };

  const dirColor = direction === 'rising' ? C.up : direction === 'falling' ? C.down : C.muted;
  const hp = hover != null ? pts[hover] : null;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  return (
    <Panel>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ color: C.fg, fontSize: 15, fontWeight: 600 }}>RSP / SPY</span>
        <span style={{ color: dirColor, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
          {last?.toFixed(4)}
        </span>
        <span style={{ color: C.muted, fontSize: 12 }}>
          50dma {dma50?.toFixed(4)} · 200dma {dma200?.toFixed(4)}
        </span>
        <span style={{
          color: dirColor, fontSize: 12, border: `1px solid ${dirColor}`,
          borderRadius: 3, padding: '2px 8px', marginLeft: 'auto',
        }}>
          {regime}
        </span>
      </div>

      {error && (
        <div style={{ color: C.down, fontSize: 12, marginBottom: 6 }}>
          refresh failed ({error}), showing last good data
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {/* horizontal grid + level lines */}
        {[
          { v: levels.support, label: `sup ${levels.support}`, color: C.down },
          { v: levels.resistance, label: `res ${levels.resistance}`, color: C.up },
        ].map(l => (
          <g key={l.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(l.v)} y2={y(l.v)}
                  stroke={l.color} strokeDasharray="2 5" strokeWidth="1" opacity="0.7" />
            <text x={W - PAD.r + 6} y={y(l.v) + 3} fill={l.color} fontSize="10">{l.label}</text>
          </g>
        ))}

        {/* moving averages */}
        <path d={path(p => p.dma50)} fill="none" stroke={C.dma50} strokeWidth="1.2" opacity="0.9" />
        <path d={path(p => p.dma200)} fill="none" stroke={C.dma200} strokeWidth="1.2" opacity="0.9" />

        {/* ratio */}
        <path d={path(p => p.ratio)} fill="none" stroke={C.accent} strokeWidth="1.6" />

        {/* last-value marker */}
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].ratio)} r="3" fill={C.accent} />

        {/* hover crosshair */}
        {hp && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b}
                  stroke={C.muted} strokeWidth="0.8" opacity="0.6" />
            <circle cx={x(hover)} cy={y(hp.ratio)} r="3" fill="none" stroke={C.fg} />
            <text x={Math.min(x(hover) + 8, W - 150)} y={PAD.t + 12} fill={C.fg} fontSize="11">
              {new Date(hp.t * 1000).toLocaleDateString()} · {hp.ratio.toFixed(4)}
            </text>
          </g>
        )}

        {/* legend */}
        <g fontSize="10" fill={C.muted}>
          <text x={PAD.l} y={H - 8}>
            <tspan fill={C.accent}>— ratio</tspan>
            <tspan dx="12" fill={C.dma50}>— 50dma</tspan>
            <tspan dx="12" fill={C.dma200}>— 200dma</tspan>
          </text>
        </g>
      </svg>
    </Panel>
  );
}

function Panel({ children }) {
  return (
    <div style={{
      background: C.bg, color: C.fg, padding: 16, borderRadius: 6,
      fontFamily: 'inherit', minHeight: 200,
    }}>
      {children}
    </div>
  );
}

function Msg({ color, children }) {
  return <div style={{ color, fontSize: 13, padding: 24 }}>{children}</div>;
}
