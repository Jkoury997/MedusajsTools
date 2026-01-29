'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type TabId = 'preparar' | 'enviar' | 'enviados';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const tabs: Tab[] = [
  {
    id: 'preparar',
    label: 'Preparar',
    color: 'red',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    id: 'enviar',
    label: 'Por Enviar',
    color: 'yellow',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
  {
    id: 'enviados',
    label: 'Enviados',
    color: 'green',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
];

interface OrderTabsProps {
  counts?: Record<TabId, number>;
}

export default function OrderTabs({ counts }: OrderTabsProps) {
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get('estado') as TabId) || 'preparar';

  const getTabClasses = (tab: Tab, isActive: boolean) => {
    if (isActive) {
      switch (tab.color) {
        case 'red':
          return 'bg-red-500 text-white border-red-500';
        case 'yellow':
          return 'bg-yellow-500 text-white border-yellow-500';
        case 'green':
          return 'bg-green-500 text-white border-green-500';
        default:
          return 'bg-gray-500 text-white border-gray-500';
      }
    }
    return 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        const count = counts?.[tab.id];

        return (
          <Link
            key={tab.id}
            href={`/?estado=${tab.id}`}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${getTabClasses(tab, isActive)}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {count !== undefined && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                isActive ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
