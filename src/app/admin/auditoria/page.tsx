'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button, Badge, Card, Alert, Spinner, type BadgeTone } from '@/components/ui';
import { AdminNav } from '@/components/AdminNav';

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

type ActionFilter = '' | 'session_start' | 'session_complete' | 'session_cancel' | 'item_pick' | 'item_unpick' | 'item_missing' | 'order_pack' | 'fulfillment_create' | 'fulfillment_error' | 'order_deliver' | 'user_create' | 'user_update' | 'user_delete' | 'admin_login' | 'store_login';

// Mapeo accion -> Badge tone (preserva la intencion de color original).
const ACTION_CONFIG: Record<string, { label: string; icon: string; tone: BadgeTone }> = {
  session_start:     { label: 'Inicio picking',     icon: '▶',  tone: 'info' },
  session_complete:  { label: 'Picking completado',  icon: '✓',  tone: 'success' },
  session_cancel:    { label: 'Picking cancelado',   icon: '✕',  tone: 'danger' },
  item_pick:         { label: 'Item pickeado',       icon: '+',  tone: 'success' },
  item_unpick:       { label: 'Item removido',       icon: '-',  tone: 'warning' },
  item_missing:      { label: 'Item faltante',       icon: '!',  tone: 'danger' },
  order_pack:        { label: 'Empaquetado',         icon: '📦', tone: 'purple' },
  fulfillment_create:{ label: 'Fulfillment creado',  icon: '🚚', tone: 'info' },
  fulfillment_error: { label: 'Error fulfillment',   icon: '⚠',  tone: 'danger' },
  order_deliver:     { label: 'Entregado tienda',    icon: '🏪', tone: 'success' },
  user_create:       { label: 'Usuario creado',      icon: '👤', tone: 'brand' },
  user_update:       { label: 'Usuario actualizado', icon: '✏',  tone: 'warning' },
  user_delete:       { label: 'Usuario eliminado',   icon: '🗑',  tone: 'danger' },
  admin_login:       { label: 'Login admin',         icon: '🔑', tone: 'gray' },
  store_login:       { label: 'Login tienda',        icon: '🏪', tone: 'success' },
};

const FILTER_GROUPS = [
  {
    label: 'Picking',
    actions: ['session_start', 'session_complete', 'session_cancel', 'item_pick', 'item_unpick', 'item_missing'],
  },
  {
    label: 'Envio',
    actions: ['order_pack', 'fulfillment_create', 'fulfillment_error', 'order_deliver'],
  },
  {
    label: 'Admin',
    actions: ['user_create', 'user_update', 'user_delete', 'admin_login', 'store_login'],
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
    fetchLogs();
  }, [fetchLogs]);

  // Agrupar logs por fecha
  const logsByDate = logs.reduce<Record<string, AuditEntry[]>>((acc, log) => {
    const dateKey = formatDate(log.createdAt);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-8">
      <AdminNav />

      {/* Header */}
      <div className="px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8 border-b">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Log de Auditoría</h1>
          <p className="text-xs text-gray-500">{total} evento{total !== 1 ? 's' : ''}</p>
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
            <Button
              key={f.key}
              size="sm"
              variant={dateFilter === f.key ? 'primary' : 'secondary'}
              onClick={() => setDateFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={actionFilter ? 'primary' : 'secondary'}
            onClick={() => setShowFilters(!showFilters)}
            className="ml-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {actionFilter && <span>1</span>}
          </Button>
        </div>

        {/* Panel de filtros por accion */}
        {showFilters && (
          <Card className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase">Filtrar por acción</span>
              {actionFilter && (
                <button
                  onClick={() => setActionFilter('')}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Limpiar
                </button>
              )}
            </div>
            {FILTER_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.actions.map(a => {
                    const cfg = ACTION_CONFIG[a];
                    const selected = actionFilter === a;
                    return (
                      <button
                        key={a}
                        onClick={() => setActionFilter(selected ? '' : a as ActionFilter)}
                        className={`rounded-full transition-opacity ${selected ? 'ring-2 ring-brand-400 ring-offset-1' : 'hover:opacity-80'}`}
                      >
                        <Badge tone={cfg.tone}>{cfg.icon} {cfg.label}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12 text-brand-500">
            <Spinner className="w-8 h-8" />
          </div>
        )}

        {/* Sin datos */}
        {!loading && logs.length === 0 && (
          <Alert tone="info">No hay registros en este período.</Alert>
        )}

        {/* Timeline agrupado por fecha */}
        {!loading && Object.entries(logsByDate).map(([date, entries]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 px-2">{date}</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="space-y-1.5">
              {entries.map(log => {
                const cfg = ACTION_CONFIG[log.action] || { label: log.action, icon: '?', tone: 'gray' as BadgeTone };
                return (
                  <Card key={log._id} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {/* Contenido */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge tone={cfg.tone}>{cfg.icon} {cfg.label}</Badge>
                            {log.orderDisplayId && (
                              <Link
                                href={`/pedido/${log.orderId}`}
                                className="text-xs font-bold text-gray-900 hover:text-brand-600"
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
                          <p className="text-xs text-gray-500 mt-1 truncate">{log.details}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          por <span className="font-medium">{log.userName}</span>
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
