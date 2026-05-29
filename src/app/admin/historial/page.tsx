'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthCard, PinInput, Button, Badge, Card, Alert, Spinner, Tabs } from '@/components/ui';
import { formatDate } from '@/lib/format';

interface HistorySession {
  _id: string;
  orderId: string;
  orderDisplayId: number;
  status: 'completed' | 'cancelled';
  userName: string;
  completedByName?: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  totalRequired: number;
  totalPicked: number;
  cancelReason?: string;
  cancelledAt?: string;
}

interface PeriodStats {
  completedCount: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  totalItemsPicked: number;
  totalItemsRequired: number;
  avgItemsPerOrder: number;
  avgSecondsPerItem: number;
  pickAccuracy: number;
  fastestPickSeconds: number;
  slowestPickSeconds: number;
  cancelledCount: number;
}

interface PickerStat {
  userId: string;
  userName: string;
  completedOrders: number;
  cancelledOrders: number;
  totalOrders: number;
  cancelRate: number;
  totalItemsPicked: number;
  totalItemsRequired: number;
  accuracy: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  avgItemsPerOrder: number;
  avgSecondsPerItem: number;
  firstPickAt: string | null;
  lastPickAt: string | null;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDurationLong(seconds: number): string {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// Colores para avatares de pickers
const PICKER_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500',
];

function getPickerColor(index: number): string {
  return PICKER_COLORS[index % PICKER_COLORS.length];
}

export default function HistorialPage() {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Data
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [total, setTotal] = useState(0);
  const [periodStats, setPeriodStats] = useState<PeriodStats>({
    completedCount: 0, avgDurationSeconds: 0, totalDurationSeconds: 0,
    totalItemsPicked: 0, totalItemsRequired: 0, avgItemsPerOrder: 0,
    avgSecondsPerItem: 0, pickAccuracy: 100, fastestPickSeconds: 0,
    slowestPickSeconds: 0, cancelledCount: 0,
  });
  const [pickerStats, setPickerStats] = useState<PickerStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros y vista
  const [dateFilter, setDateFilter] = useState('today');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log'>('dashboard');
  const [expandedPicker, setExpandedPicker] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, dateFilter]);

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (!adminPin || adminPin.length < 4) {
      setAuthError('Ingresá un PIN de 4 a 6 dígitos');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/picking/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setAuthError('PIN incorrecto');
        setAdminPin('');
      }
    } catch {
      setAuthError('Error de conexion');
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });

      if (dateFilter === 'today') {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        params.set('from', dateStr);
        params.set('to', dateStr);
      } else if (dateFilter === 'week') {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        params.set('from', weekAgo.toISOString().split('T')[0]);
        params.set('to', today.toISOString().split('T')[0]);
      }

      const res = await fetch(`/api/picking/history?${params}`);
      const data = await res.json();

      if (data.success) {
        setSessions(data.sessions);
        setTotal(data.total);
        if (data.periodStats) setPeriodStats(data.periodStats);
        if (data.pickerStats) setPickerStats(data.pickerStats);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  // PIN Gate
  if (!isAuthenticated) {
    return (
      <AuthCard
        icon="📊"
        title="Historial de Picking"
        subtitle="Ingresá el PIN de administrador"
        footer={
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            Volver al inicio
          </Link>
        }
      >
        <form onSubmit={handleAdminAuth} className="space-y-4">
          <PinInput
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
          />
          {authError && <Alert tone="error">{authError}</Alert>}
          <Button type="submit" fullWidth loading={authLoading} disabled={authLoading || adminPin.length < 4}>
            {authLoading ? 'Verificando…' : 'Ingresar'}
          </Button>
        </form>
      </AuthCard>
    );
  }

  const periodLabel = dateFilter === 'today' ? 'hoy' : dateFilter === 'week' ? 'esta semana' : 'total';

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Métricas de Picking</h1>
              <p className="text-xs text-gray-500">{total} registro{total !== 1 ? 's' : ''} {periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/faltantes" className="text-sm text-brand-600 font-medium hover:text-brand-700">
              Faltantes
            </Link>
            <Link href="/admin/auditoria" className="text-sm text-brand-600 font-medium hover:text-brand-700">
              Auditoría
            </Link>
            <Link href="/admin/usuarios" className="text-sm text-brand-600 font-medium hover:text-brand-700">
              Usuarios
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Filtros de fecha */}
        <div className="flex gap-2">
          {[
            { key: 'today', label: 'Hoy' },
            { key: 'week', label: 'Semana' },
            { key: 'all', label: 'Todo' },
          ].map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={dateFilter === f.key ? 'primary' : 'secondary'}
              onClick={() => setDateFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Tabs Dashboard / Log */}
        <Tabs
          tabs={[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'log', label: 'Log' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'dashboard' | 'log')}
        />

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12 text-brand-500">
            <Spinner className="w-8 h-8" />
          </div>
        )}

        {/* ===== DASHBOARD TAB ===== */}
        {!loading && activeTab === 'dashboard' && (
          <div className="space-y-4">
            {/* Resumen global */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Resumen General</h2>
              <div className="grid grid-cols-3 gap-2">
                <StatCard value={periodStats.completedCount} label="Completados" color="blue" />
                <StatCard value={periodStats.totalItemsPicked} label="Items pickeados" color="green" />
                <StatCard value={formatDuration(periodStats.avgDurationSeconds)} label="Prom. por pedido" color="purple" />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <StatCard value={`${periodStats.avgItemsPerOrder}`} label="Prom. items/pedido" color="cyan" />
                <StatCard value={formatDuration(periodStats.avgSecondsPerItem)} label="Prom. por item" color="amber" />
                <StatCard value={`${periodStats.pickAccuracy}%`} label="Precision" color="emerald" />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <StatCard value={formatDuration(periodStats.fastestPickSeconds)} label="Mas rapido" color="green" />
                <StatCard value={formatDuration(periodStats.slowestPickSeconds)} label="Mas lento" color="orange" />
                <StatCard
                  value={periodStats.cancelledCount}
                  label="Cancelados"
                  color="red"
                />
              </div>
              {/* Barra de tiempo total */}
              {periodStats.totalDurationSeconds > 0 && (
                <Card className="mt-2 text-center bg-brand-50 border-brand-100">
                  <p className="text-xs text-gray-500 mb-0.5">Tiempo total de picking</p>
                  <p className="text-xl font-bold text-gray-800">{formatDurationLong(periodStats.totalDurationSeconds)}</p>
                </Card>
              )}
            </div>

            {/* Ranking por picker */}
            {pickerStats.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Rendimiento por Picker</h2>
                <div className="space-y-2">
                  {pickerStats.map((picker, idx) => (
                    <Card key={picker.userId} padding={false} className="overflow-hidden">
                      {/* Header del picker (clickeable para expandir) */}
                      <button
                        onClick={() => setExpandedPicker(expandedPicker === picker.userId ? null : picker.userId)}
                        className="w-full p-3 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className={`w-9 h-9 ${getPickerColor(idx)} rounded-full flex items-center justify-center text-white text-sm font-bold`}>
                                {picker.userName.charAt(0).toUpperCase()}
                              </div>
                              {idx === 0 && pickerStats.length > 1 && (
                                <span className="absolute -top-1 -right-1 text-xs">&#x1F451;</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{picker.userName}</p>
                              <p className="text-xs text-gray-500">
                                {picker.completedOrders} pedido{picker.completedOrders !== 1 ? 's' : ''}
                                {' '}&middot;{' '}
                                {picker.totalItemsPicked} items
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-mono font-bold text-gray-700">{formatDuration(picker.avgDurationSeconds)}</p>
                              <p className="text-[10px] text-gray-400">prom/pedido</p>
                            </div>
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${expandedPicker === picker.userId ? 'rotate-180' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>

                        {/* Progress bar de items */}
                        {periodStats.totalItemsPicked > 0 && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div
                                className={`${getPickerColor(idx)} rounded-full h-1.5 transition-all`}
                                style={{ width: `${Math.min(100, (picker.totalItemsPicked / periodStats.totalItemsPicked) * 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                              {Math.round((picker.totalItemsPicked / periodStats.totalItemsPicked) * 100)}% del total
                            </p>
                          </div>
                        )}
                      </button>

                      {/* Detalle expandido */}
                      {expandedPicker === picker.userId && (
                        <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <MetricRow label="Pedidos completados" value={`${picker.completedOrders}`} />
                            <MetricRow label="Pedidos cancelados" value={`${picker.cancelledOrders}`} warn={picker.cancelledOrders > 0} />
                            <MetricRow label="Items pickeados" value={`${picker.totalItemsPicked}`} />
                            <MetricRow label="Items requeridos" value={`${picker.totalItemsRequired}`} />
                            <MetricRow label="Precision" value={`${picker.accuracy}%`} good={picker.accuracy >= 95} />
                            <MetricRow label="Tasa cancelacion" value={`${picker.cancelRate}%`} warn={picker.cancelRate > 15} />
                            <MetricRow label="Prom. items/pedido" value={`${picker.avgItemsPerOrder}`} />
                            <MetricRow label="Prom. seg/item" value={formatDuration(picker.avgSecondsPerItem)} />
                            <MetricRow label="Tiempo prom." value={formatDuration(picker.avgDurationSeconds)} />
                            <MetricRow label="Tiempo total" value={formatDurationLong(picker.totalDurationSeconds)} />
                            <MetricRow label="Mas rapido" value={formatDuration(picker.minDurationSeconds)} />
                            <MetricRow label="Mas lento" value={formatDuration(picker.maxDurationSeconds)} />
                          </div>
                          {picker.firstPickAt && picker.lastPickAt && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-[10px] text-gray-400">
                                Primer pick: {formatDate(picker.firstPickAt)}
                                {' '}&middot;{' '}
                                Ultimo: {formatDate(picker.lastPickAt)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Sin datos */}
            {pickerStats.length === 0 && periodStats.completedCount === 0 && (
              <EmptyState />
            )}
          </div>
        )}

        {/* ===== LOG TAB ===== */}
        {!loading && activeTab === 'log' && (
          <div>
            {sessions.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2">
                {sessions.map(s => (
                  <Link key={s._id} href={`/pedido/${s.orderId}`} className="block">
                    <Card padding={false} className={s.status === 'cancelled' ? 'border-red-200 opacity-70' : ''}>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900">#{s.orderDisplayId}</span>
                            {s.status === 'cancelled' ? (
                              <Badge tone="danger">Cancelado</Badge>
                            ) : (
                              <Badge tone="success">Completado</Badge>
                            )}
                          </div>
                          <span className="text-sm font-mono font-bold text-gray-700">
                            {formatDuration(s.durationSeconds)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                              {s.userName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-600">{s.userName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">
                              {s.totalPicked}/{s.totalRequired} items
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatDate(s.completedAt || s.startedAt)}
                            </span>
                          </div>
                        </div>

                        {s.status === 'cancelled' && s.cancelReason && (
                          <div className="mt-2 bg-red-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-red-700">
                              <span className="font-semibold">Motivo:</span> {s.cancelReason}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Componentes auxiliares ----

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string; label: string }> = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'text-blue-500' },
    green:   { bg: 'bg-green-50',   text: 'text-green-700',   label: 'text-green-500' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'text-purple-500' },
    cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    label: 'text-cyan-500' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'text-amber-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'text-emerald-500' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'text-orange-500' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     label: 'text-red-500' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`${c.bg} rounded-xl p-2.5 text-center`}>
      <p className={`text-lg font-bold ${c.text} leading-tight`}>{value}</p>
      <p className={`text-[10px] ${c.label} leading-tight mt-0.5`}>{label}</p>
    </div>
  );
}

function MetricRow({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-semibold ${
        warn ? 'text-red-600' : good ? 'text-green-600' : 'text-gray-800'
      }`}>
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return <Alert tone="info">No hay pickings en este período.</Alert>;
}
