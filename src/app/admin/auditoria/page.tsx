'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AuditEntry {
  _id: string;
  action: string;
  userName: string;
  userId?: string;
  orderId?: string;
  orderDisplayId?: number;
  details?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

type ActionFilter = '' | 'session_start' | 'session_complete' | 'session_cancel' | 'item_pick' | 'item_unpick' | 'order_pack' | 'fulfillment_create' | 'fulfillment_error' | 'user_create' | 'user_update' | 'user_delete' | 'admin_login';

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  session_start:     { label: 'Inicio picking',     icon: '▶',  color: 'text-blue-700',    bg: 'bg-blue-100' },
  session_complete:  { label: 'Picking completado',  icon: '✓',  color: 'text-green-700',   bg: 'bg-green-100' },
  session_cancel:    { label: 'Picking cancelado',   icon: '✕',  color: 'text-red-700',     bg: 'bg-red-100' },
  item_pick:         { label: 'Item pickeado',       icon: '+',  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  item_unpick:       { label: 'Item removido',       icon: '-',  color: 'text-orange-700',  bg: 'bg-orange-50' },
  order_pack:        { label: 'Empaquetado',         icon: '📦', color: 'text-purple-700',  bg: 'bg-purple-100' },
  fulfillment_create:{ label: 'Fulfillment creado',  icon: '🚚', color: 'text-cyan-700',    bg: 'bg-cyan-100' },
  fulfillment_error: { label: 'Error fulfillment',   icon: '⚠',  color: 'text-red-700',     bg: 'bg-red-50' },
  user_create:       { label: 'Usuario creado',      icon: '👤', color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  user_update:       { label: 'Usuario actualizado', icon: '✏',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  user_delete:       { label: 'Usuario eliminado',   icon: '🗑',  color: 'text-red-700',     bg: 'bg-red-100' },
  admin_login:       { label: 'Login admin',         icon: '🔑', color: 'text-gray-700',    bg: 'bg-gray-100' },
};

const FILTER_GROUPS = [
  {
    label: 'Picking',
    actions: ['session_start', 'session_complete', 'session_cancel', 'item_pick', 'item_unpick'],
  },
  {
    label: 'Envio',
    actions: ['order_pack', 'fulfillment_create', 'fulfillment_error'],
  },
  {
    label: 'Admin',
    actions: ['user_create', 'user_update', 'user_delete', 'admin_login'],
  },
];

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditoriaPage() {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Data
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [dateFilter, setDateFilter] = useState('today');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
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

      if (actionFilter) params.set('action', actionFilter);

      const res = await fetch(`/api/picking/audit?${params}`);
      const data = await res.json();

      if (data.success) {
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, actionFilter]);

  useEffect(() => {
    if (isAuthenticated) fetchLogs();
  }, [isAuthenticated, fetchLogs]);

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (!adminPin || adminPin.length !== 4) {
      setAuthError('Ingresa un PIN de 4 digitos');
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

  // PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center -mt-16">
        <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Log de Auditoria</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresa el PIN de administrador</p>
          </div>
          <form onSubmit={handleAdminAuth} className="space-y-4">
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder="----"
              maxLength={4}
              inputMode="numeric"
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{authError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading || adminPin.length !== 4}
              className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-amber-700"
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

  // Agrupar logs por fecha
  const logsByDate = logs.reduce<Record<string, AuditEntry[]>>((acc, log) => {
    const dateKey = formatDate(log.createdAt);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

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
              <h1 className="text-lg font-bold text-gray-900">Log de Auditoria</h1>
              <p className="text-xs text-gray-500">{total} evento{total !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/historial" className="text-sm text-purple-600 font-medium hover:text-purple-700">
              Metricas
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`ml-auto px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              actionFilter
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {actionFilter && <span className="ml-1">1</span>}
          </button>
        </div>

        {/* Panel de filtros por accion */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase">Filtrar por accion</span>
              {actionFilter && (
                <button
                  onClick={() => setActionFilter('')}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Limpiar
                </button>
              )}
            </div>
            {FILTER_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.actions.map(a => {
                    const cfg = ACTION_CONFIG[a];
                    return (
                      <button
                        key={a}
                        onClick={() => setActionFilter(actionFilter === a ? '' : a as ActionFilter)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                          actionFilter === a
                            ? 'bg-gray-900 text-white'
                            : `${cfg.bg} ${cfg.color} hover:opacity-80`
                        }`}
                      >
                        {cfg.icon} {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-xl border p-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Sin datos */}
        {!loading && logs.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900">Sin eventos</h3>
            <p className="text-xs text-gray-500 mt-1">No hay registros en este periodo</p>
          </div>
        )}

        {/* Timeline agrupado por fecha */}
        {!loading && Object.entries(logsByDate).map(([date, entries]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 px-2">{date}</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="space-y-1">
              {entries.map(log => {
                const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: '?', color: 'text-gray-700', bg: 'bg-gray-100' };
                return (
                  <div key={log._id} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-start gap-2">
                      {/* Icono */}
                      <span className={`${cfg.bg} ${cfg.color} w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5`}>
                        {cfg.icon}
                      </span>
                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                            {log.orderDisplayId && (
                              <Link
                                href={`/pedido/${log.orderId}`}
                                className="text-xs font-bold text-gray-900 hover:text-blue-600"
                              >
                                #{log.orderDisplayId}
                              </Link>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 font-mono">
                            {formatTime(log.createdAt)}
                          </span>
                        </div>
                        {log.details && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{log.details}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          por <span className="font-medium">{log.userName}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
