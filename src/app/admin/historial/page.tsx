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

interface TodayStats {
  completedCount: number;
  avgDurationSeconds: number;
  totalItemsPicked: number;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
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

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [todayStats, setTodayStats] = useState<TodayStats>({ completedCount: 0, avgDurationSeconds: 0, totalItemsPicked: 0 });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    if (isAuthenticated) fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, dateFilter]);

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (!adminPin || adminPin.length !== 4) {
      setAuthError('Ingresá un PIN de 4 dígitos');
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
      setAuthError('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchHistory() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });

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
      // 'all' no agrega filtros de fecha

      const res = await fetch(`/api/picking/history?${params}`);
      const data = await res.json();

      if (data.success) {
        setSessions(data.sessions);
        setTotal(data.total);
        setTodayStats(data.todayStats);
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
            <p className="text-sm text-gray-500 mt-1">Ingresá el PIN de administrador</p>
          </div>
          <form onSubmit={handleAdminAuth} className="space-y-4">
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              maxLength={4}
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
              disabled={authLoading || adminPin.length !== 4}
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

  return (
    <div className="min-h-screen">
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
              <h1 className="text-lg font-bold text-gray-900">Historial de Picking</h1>
              <p className="text-xs text-gray-500">{total} registro{total !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Link
            href="/admin/usuarios"
            className="text-sm text-purple-600 font-medium hover:text-purple-700"
          >
            Usuarios
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Stats de hoy */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{todayStats.completedCount}</p>
            <p className="text-xs text-blue-500">Hoy</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{todayStats.totalItemsPicked}</p>
            <p className="text-xs text-green-500">Items hoy</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{formatDuration(todayStats.avgDurationSeconds)}</p>
            <p className="text-xs text-purple-500">Promedio</p>
          </div>
        </div>

        {/* Filtros */}
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

        {/* Lista vacía */}
        {!loading && sessions.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900">Sin registros</h3>
            <p className="text-xs text-gray-500 mt-1">No hay pickings en este período</p>
          </div>
        )}

        {/* Lista de sesiones */}
        {!loading && sessions.length > 0 && (
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

                    {/* Razón de cancelación */}
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
    </div>
  );
}
