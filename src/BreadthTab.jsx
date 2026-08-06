// src/BreadthTab.jsx
// Breadth tab: RSP/SPY ratio from /api/breadth, charted with Recharts.
//
// Polls every 30s (matches the server's cache TTL). Fails visibly: a 502 from
// the API renders an explicit error state; a failed refresh keeps the last good
// data on screen with a banner.

import { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { TERM } from './palette.js';

const POLL_MS = 30_000;

const fmtDate = (t) =>
  new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const by = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="rounded border border-term-grid bg-term-bg/95 px-2.5 py-1.5 text-[11px]">
      <div className="mb-0.5 text-term-muted">{fmtDate(label)}</div>
      <div className="text-term-accent">ratio {by.ratio?.toFixed(4)}</div>
      {by.dma50 != null && <div style={{ color: TERM.dma50 }}>50dma {by.dma50.toFixed(4)}</div>}
      {by.dma200 != null && <div style={{ color: TERM.dma200 }}>200dma {by.dma200.toFixed(4)}</div>}
    </div>
  );
}

function LegendDot({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-3.5" style={{ background: color }} />
      <span className="text-term-muted">{children}</span>
    </span>
  );
}

export default function BreadthTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
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

  if (!data && !error)
    return (
      <Panel>
        <p className="p-6 text-[13px] text-term-muted">loading breadth…</p>
      </Panel>
    );
  if (!data && error)
    return (
      <Panel>
        <p className="p-6 text-[13px] text-term-down">breadth data unavailable: {error}</p>
      </Panel>
    );

  const { series, last, dma50, dma200, levels, regime, direction } = data;

  const dirColor =
    direction === 'rising' ? TERM.up : direction === 'falling' ? TERM.down : TERM.muted;

  // y-domain from ratios, moving averages, and level lines with a little padding.
  const ys = [
    ...series.map((p) => p.ratio),
    ...series.map((p) => p.dma50),
    ...series.map((p) => p.dma200),
    ...Object.values(levels),
  ].filter((v) => v != null);
  const yMin = Math.min(...ys) * 0.999;
  const yMax = Math.max(...ys) * 1.001;

  return (
    <Panel>
      {/* header */}
      <div className="mb-2 flex flex-wrap items-baseline gap-4">
        <span className="text-[15px] font-semibold text-term-fg">RSP / SPY</span>
        <span className="text-2xl tabular-nums" style={{ color: dirColor }}>
          {last?.toFixed(4)}
        </span>
        <span className="text-xs text-term-muted">
          50dma {dma50?.toFixed(4)} · 200dma {dma200?.toFixed(4)}
        </span>
        <span
          className="ml-auto rounded border px-2 py-0.5 text-xs"
          style={{ color: dirColor, borderColor: dirColor }}
        >
          {regime}
        </span>
      </div>

      {error && (
        <div className="mb-1.5 text-xs text-term-down">
          refresh failed ({error}), showing last good data
        </div>
      )}

      <div className="h-[380px] w-full">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 12, right: 56, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={TERM.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={fmtDate}
              minTickGap={48}
              tick={{ fill: TERM.muted, fontSize: 10 }}
              stroke={TERM.grid}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => v.toFixed(3)}
              width={52}
              tick={{ fill: TERM.muted, fontSize: 10 }}
              stroke={TERM.grid}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: TERM.muted, strokeWidth: 0.8 }} />

            <ReferenceLine
              y={levels.support}
              stroke={TERM.down}
              strokeDasharray="2 5"
              label={{
                value: `sup ${levels.support}`,
                position: 'insideBottomRight',
                fill: TERM.down,
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={levels.resistance}
              stroke={TERM.up}
              strokeDasharray="2 5"
              label={{
                value: `res ${levels.resistance}`,
                position: 'insideTopRight',
                fill: TERM.up,
                fontSize: 10,
              }}
            />

            <Line
              type="monotone"
              dataKey="dma200"
              stroke={TERM.dma200}
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="dma50"
              stroke={TERM.dma50}
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="ratio"
              stroke={TERM.accent}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* legend */}
      <div className="mt-2 flex gap-4 text-[10px]">
        <LegendDot color={TERM.accent}>ratio</LegendDot>
        <LegendDot color={TERM.dma50}>50dma</LegendDot>
        <LegendDot color={TERM.dma200}>200dma</LegendDot>
      </div>
    </Panel>
  );
}

function Panel({ children }) {
  return <div className="min-h-[200px] rounded-md bg-term-panel p-4">{children}</div>;
}
