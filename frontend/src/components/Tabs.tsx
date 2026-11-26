import { useState, type ReactNode } from 'react'

export interface TabDef {
  id: string
  label: string
  element: ReactNode
}

export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === current?.id}
            onClick={() => setActive(t.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
              t.id === current?.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-5">
        {current?.element}
      </div>
    </div>
  )
}
