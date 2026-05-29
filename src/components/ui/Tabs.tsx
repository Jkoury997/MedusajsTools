'use client';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 whitespace-nowrap py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
            active === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="ml-1 text-xs opacity-70">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}
