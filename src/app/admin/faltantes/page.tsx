'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProductRankingItem {
  sku: string | null;
  barcode: string | null;
  variantId: string | null;
  totalMissing: number;
  occurrences: number;
  orderCount: number;
}

interface PickerMissing {
  userId: string;
  userName: string;
  totalMissing: number;
  ordersWithMissing: number;
}

interface DailyTrend {
  date: string;
  totalMissing: number;
  sessions: number;
  sessionsWithMissing: number;
}

interface StatsData {
  period: { from: string; to: string };
  global: {
    totalMissing: number;
    totalSessions: number;
    sessionsWithMissing: number;
    missingRate: number;
  };
  today: {
    totalMissing: number;
    sessionsWithMissing: number;
  };
  productRanking: ProductRankingItem[];
  perPicker: PickerMissing[];
  dailyTrend: DailyTrend[];
}

type Period = 'today' | 'week' | 'all';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export default function FaltantesPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');

  useEffect(() => {
    fetchStats();
  }, [period]);

  async function fetchStats() {
    setLoading(true);
    try {
      const now = new Date();
      let from = '';
      let to = '';

      if (period === 'today') {
        from = now.toISOString().split('T')[0];
        to = from;
      } else if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        from = weekAgo.toISOString().split('T')[0];
        to = now.toISOString().split('T')[0];
      }
      // 'all' = no params (defaults to 30 days)

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/stats/faltantes?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setStats(data);
      }
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-gray-600 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Productos Faltantes</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Period filter */}
        <div className="flex gap-2">
          {(['today', 'week', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : stats ? (
          <>
            {/* Global stats cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{stats.global.totalMissing}</p>
                <p className="text-xs text-gray-500 mt-1">Total faltantes</p>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-gray-900">{stats.global.sessionsWithMissing}</p>
                <p className="text-xs text-gray-500 mt-1">Pedidos con faltantes</p>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-orange-600">{stats.global.missingRate}%</p>
                <p className="text-xs text-gray-500 mt-1">Tasa de faltantes</p>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{stats.today.totalMissing}</p>
                <p className="text-xs text-gray-500 mt-1">Faltantes hoy</p>
              </div>
            </div>

            {/* Daily trend */}
            {stats.dailyTrend.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Tendencia diaria</h3>
                <div className="flex items-end gap-1 h-24">
                  {stats.dailyTrend.map((day) => {
                    const maxMissing = Math.max(...stats.dailyTrend.map(d => d.totalMissing), 1);
                    const height = (day.totalMissing / maxMissing) * 100;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500 font-mono">
                          {day.totalMissing > 0 ? day.totalMissing : ''}
                        </span>
                        <div
                          className={`w-full rounded-t ${day.totalMissing > 0 ? 'bg-red-400' : 'bg-gray-200'}`}
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <span className="text-xs text-gray-400">{formatDate(day.date)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Product ranking */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-4 border-b">
                <h3 className="text-sm font-bold text-gray-700">Ranking de productos faltantes</h3>
              </div>
              {stats.productRanking.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  Sin faltantes en este periodo
                </div>
              ) : (
                <div className="divide-y">
                  {stats.productRanking.map((product, i) => (
                    <div key={`${product.sku}-${product.barcode}-${i}`} className="p-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-red-100 text-red-700' :
                        i === 1 ? 'bg-orange-100 text-orange-700' :
                        i === 2 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product.sku || product.barcode || product.variantId || 'Desconocido'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {product.occurrences} veces en {product.orderCount} pedidos
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-red-600">{product.totalMissing}</p>
                        <p className="text-xs text-gray-500">unidades</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Per picker */}
            {stats.perPicker.length > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="p-4 border-b">
                  <h3 className="text-sm font-bold text-gray-700">Faltantes por picker</h3>
                </div>
                <div className="divide-y">
                  {stats.perPicker.map((picker) => (
                    <div key={picker.userId} className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                        {picker.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{picker.userName}</p>
                        <p className="text-xs text-gray-500">{picker.ordersWithMissing} pedidos con faltantes</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">{picker.totalMissing}</p>
                        <p className="text-xs text-gray-500">faltantes</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">Error al cargar datos</div>
        )}
      </div>
    </div>
  );
}
