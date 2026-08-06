// App shell: a small tab strip over the terminal panels.
// Breadth is fully wired to /api/breadth. AI Calls / AI Puts are the scanner
// tabs (see ScannerTab for the scaffold note).

import { useState } from 'react';
import BreadthTab from './BreadthTab.jsx';
import ScannerTab from './ScannerTab.jsx';

const C = {
  fg: 'var(--term-fg, #d8dee9)',
  muted: 'var(--term-muted, #6b7280)',
  accent: 'var(--term-accent, #e8b64c)',
  grid: 'var(--term-grid, #1f2430)',
};

const TABS = [
  { id: 'breadth', label: 'Breadth', render: () => <BreadthTab /> },
  { id: 'calls', label: 'AI Calls', render: () => <ScannerTab side="calls" /> },
  { id: 'puts', label: 'AI Puts', render: () => <ScannerTab side="puts" /> },
];

export default function App() {
  const [active, setActive] = useState('breadth');
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <span style={{ color: C.accent, fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
          liddar terminal
        </span>
        <span style={{ color: C.muted, fontSize: 12 }}>options + breadth</span>
      </header>

      <nav style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.grid}`, marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                background: 'transparent',
                color: on ? C.accent : C.muted,
                border: 'none',
                borderBottom: `2px solid ${on ? C.accent : 'transparent'}`,
                padding: '8px 14px',
                fontFamily: 'inherit',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <main>{tab.render()}</main>
    </div>
  );
}
