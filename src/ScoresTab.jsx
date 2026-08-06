// src/ScoresTab.jsx
// Live self-learning scores from /api/scores: hit rate with Wilson CI per
// task/cohort over resolved predictions. Honest empty states: storage not
// configured, or no resolved outcomes yet.

import { useEffect, useState } from 'react';

export default function ScoresTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/scores');
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setData(j);
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-[200px] rounded-md bg-term-panel p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[15px] font-semibold text-term-fg">Scores</span>
        <span className="text-[11px] text-term-muted">hit rate over resolved predictions · Wilson 95% CI</span>
      </div>

      {error && (
        <p className="text-[13px] text-term-down">
          {error.includes('not configured')
            ? 'storage not configured — predictions are not being persisted yet'
            : `scores unavailable: ${error}`}
        </p>
      )}

      {!error && !data && <p className="text-[13px] text-term-muted">loading…</p>}

      {data && data.scores.length === 0 && (
        <p className="text-[13px] text-term-muted">
          no resolved predictions yet — scores appear once logged ideas reach their horizon and get
          resolved.
        </p>
      )}

      {data && data.scores.length > 0 && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-term-grid text-left text-[11px] text-term-muted">
              <th className="py-1.5 pr-3 font-normal">task</th>
              <th className="py-1.5 pr-3 font-normal">cohort</th>
              <th className="py-1.5 pr-3 font-normal">hit rate</th>
              <th className="py-1.5 pr-3 font-normal">95% CI</th>
              <th className="py-1.5 font-normal">n</th>
            </tr>
          </thead>
          <tbody>
            {data.scores.map((s) => (
              <tr key={`${s.task}|${s.cohort ?? 'all'}`} className="border-b border-term-grid/50">
                <td className="py-2 pr-3 text-term-fg">{s.task}</td>
                <td className="py-2 pr-3 text-term-fg/80">{s.cohort ?? 'all'}</td>
                <td className="py-2 pr-3 tabular-nums text-term-accent">{(s.value * 100).toFixed(1)}%</td>
                <td className="py-2 pr-3 tabular-nums text-term-muted">
                  {(s.ci_low * 100).toFixed(0)}–{(s.ci_high * 100).toFixed(0)}%
                </td>
                <td className="py-2 tabular-nums text-term-fg/80">{s.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
