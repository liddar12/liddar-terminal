// App shell: a small tab strip over the terminal panels.
// Breadth is fully wired to /api/breadth. AI Calls / AI Puts are the scanner
// tabs (see ScannerTab for the scaffold note).

import { useState } from 'react';
import BreadthTab from './BreadthTab.jsx';
import ScannerTab from './ScannerTab.jsx';
import ScoresTab from './ScoresTab.jsx';

const TABS = [
  { id: 'breadth', label: 'Breadth', render: () => <BreadthTab /> },
  { id: 'calls', label: 'AI Calls', render: () => <ScannerTab side="calls" /> },
  { id: 'puts', label: 'AI Puts', render: () => <ScannerTab side="puts" /> },
  { id: 'scores', label: 'Scores', render: () => <ScoresTab /> },
];

export default function App() {
  const [active, setActive] = useState('breadth');
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <header className="mb-4 flex items-baseline gap-3">
        <span className="text-base font-bold tracking-wide text-term-accent">liddar terminal</span>
        <span className="text-xs text-term-muted">options + breadth</span>
      </header>

      <nav className="mb-5 flex gap-1 border-b border-term-grid">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={
                'border-b-2 px-4 py-2 text-[13px] transition-colors ' +
                (on
                  ? 'border-term-accent text-term-accent'
                  : 'border-transparent text-term-muted hover:text-term-fg')
              }
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
