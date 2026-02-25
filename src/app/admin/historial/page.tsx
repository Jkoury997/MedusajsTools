'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      <div className="min-h-screen flex items-center justify-center -mt-16">
        <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Historial de Picking</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresa el PIN de administrador</p>
          </div>
          <form onSubmit={handleAdminAuth} className="space-y-4">
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder="----"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{authError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading || adminPin.length < 4}
              className="w-full bg-purple-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-purple-700"
            >
              {authLoading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
          <Link href="/" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-4">
            Volver al inicio
          </Link>
        </div>
      </div>
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
              <h1 className="text-lg font-bold text-gray-900">Metricas de Picking</h1>
              <p className="text-xs text-gray-500">{total} registro{total !== 1 ? 's' : ''} {periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/faltantes" className="text-sm text-red-600 font-medium hover:text-red-700">
              Faltantes
            </Link>
            <Link href="/admin/auditoria" className="text-sm text-amber-600 font-medium hover:text-amber-700">
              Auditoria
            </Link>
            <Link href="/admin/usuarios" className="text-sm text-purple-600 font-medium hover:text-purple-700">
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
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateFilter === f.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabs Dashboard / Log */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'log'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Log
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
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
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mt-2 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">Tiempo total de picking</p>
                  <p className="text-xl font-bold text-gray-800">{formatDurationLong(periodStats.totalDurationSeconds)}</p>
                </div>
              )}
            </div>

            {/* Ranking por picker */}
            {pickerStats.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Rendimiento por Picker</h2>
                <div className="space-y-2">
                  {pickerStats.map((picker, idx) => (
                    <div key={picker.userId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    </div>
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
                    <div className={`bg-white rounded-xl border overflow-hidden ${
                      s.status === 'cancelled' ? 'border-red-200 opacity-70' : 'border-gray-200'
                    }`}>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900">#{s.orderDisplayId}</span>
                            {s.status === 'cancelled' ? (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">Cancelado</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Completado</span>
                            )}
                          </div>
                          <span className="text-sm font-mono font-bold text-gray-700">
                            {formatDuration(s.durationSeconds)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
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
                    </div>
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
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 className="text-sm font-medium text-gray-900">Sin registros</h3>
      <p className="text-xs text-gray-500 mt-1">No hay pickings en este periodo</p>
    </div>
  );
}
