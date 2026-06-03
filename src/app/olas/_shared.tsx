'use client';

import { useEffect, useRef, useState } from 'react';

// ---------- Tipos (espejo de serializeWave en src/lib/wave.ts) ----------
export type WaveStatus = 'draft' | 'picking' | 'sorting' | 'ready' | 'completed' | 'cancelled';

export interface WaveLine {
  id: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  title?: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityShort: number;
}
export interface WaveOrderItem {
  id: string;
  lineItemId: string;
  sku?: string;
  barcode?: string;
  quantityRequired: number;
  quantitySorted: number;
  quantityMissing: number;
}
export interface WaveOrder {
  id: string;
  orderId: string;
  orderDisplayId: number;
  letter: string;
  priority: number;
  status: 'pending' | 'sorting' | 'ready';
  readyAt?: string;
  items: WaveOrderItem[];
}
export interface Wave {
  id: string;
  displayNumber: number;
  storeId: string;
  stationId: string;
  status: WaveStatus;
  createdByName: string;
  createdAt: string;
  pickingStartedAt?: string;
  sortingStartedAt?: string;
  completedAt?: string;
  orders: WaveOrder[];
  lines: WaveLine[];
}

export interface SuggestOrder {
  letter: string;
  priority: number;
  orderId: string;
  orderDisplayId: number;
  createdAt: string;
  itemCount: number;
}
export interface SuggestLine {
  key: string;
  sku?: string;
  barcode?: string;
  title: string;
  quantityRequired: number;
}

export const STATIONS = [
  { id: 'mesa-1', label: 'Mesa 1' },
  { id: 'mesa-2', label: 'Mesa 2' },
];
export const STATION_LABEL: Record<string, string> = { 'mesa-1': 'Mesa 1', 'mesa-2': 'Mesa 2' };

export const STATUS_BADGE: Record<WaveStatus, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'b-gray' },
  picking: { label: 'Recolectando', cls: 'b-pink' },
  sorting: { label: 'Clasificando', cls: 'b-warn' },
  ready: { label: 'Lista', cls: 'b-ok' },
  completed: { label: 'Enviada', cls: 'b-ok' },
  cancelled: { label: 'Cancelada', cls: 'b-danger' },
};

// ---------- API helper ----------
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; store?: string | null } = {}
): Promise<T> {
  const url = opts.store ? `${path}${path.includes('?') ? '&' : '?'}storeId=${opts.store}` : path;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data as T;
}

/** storeId opcional desde la query (?store=) para el caso admin. Se lee una sola
 *  vez al montar (init lazy) para no cambiar después y evitar renders en cascada. */
export function useStoreParam(): string | null {
  const [store] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('store')
  );
  return store;
}

export function timeAgo(iso?: string): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'recién';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d > 1 ? 's' : ''}`;
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---------- Íconos ----------
export function Icon({ name, style }: { name: string; style?: React.CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    back: <path d="m15 18-6-6 6-6" />,
    chevR: <path d="m9 18 6-6-6-6" />,
    chevD: <path d="m6 9 6 6 6-6" />,
    check: <path d="M20 6 9 17l-5-5" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    plus: <path d="M12 5v14M5 12h14" />,
    scan: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
    box: <><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
    info: <><path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="9" /></>,
    print: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  };
  return (
    <svg className="i" viewBox="0 0 24 24" style={style} aria-hidden>
      {paths[name]}
    </svg>
  );
}

// ---------- Input de escaneo (auto-foco, submit con Enter) ----------
export function ScanInput({
  onScan,
  placeholder = 'Escaneá un código…',
  lite = false,
  disabled = false,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  lite?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);
  return (
    <div className={`scan${lite ? ' lite' : ''}`} onClick={() => ref.current?.focus()}>
      <Icon name="scan" style={{ color: 'var(--pink)' }} />
      <input
        ref={ref}
        value={val}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && val.trim()) {
            onScan(val.trim());
            setVal('');
          }
        }}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <span className="blink" />
    </div>
  );
}

// ---------- Toast efímero ----------
export function useToast() {
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  function show(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setToast(null), 2600);
  }
  return { toast, show };
}

export function Toast({ toast }: { toast: { kind: 'ok' | 'err'; msg: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`}>
      <span className="ico">
        <Icon name={toast.kind === 'ok' ? 'check' : 'x'} style={{ width: 15, height: 15, strokeWidth: 3 }} />
      </span>
      {toast.msg}
    </div>
  );
}
