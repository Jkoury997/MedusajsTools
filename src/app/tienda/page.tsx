'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface StoreUser {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
}

interface StoreOrder {
  id: string;
  display_id: number;
  fulfillment_status: string;
  total: number;
  created_at: string;
  email?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address_1?: string;
    city?: string;
    metadata?: {
      dni?: string;
    };
  };
  shipping_methods?: {
    name?: string;
    data?: {
      store?: {
        id: string;
        name: string;
        address: string;
      };
    };
  }[];
  items?: {
    id: string;
    quantity: number;
    title?: string;
    product_title?: string;
    variant_title?: string;
    variant_sku?: string;
    thumbnail?: string;
    unit_price?: number;
  }[];
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TiendaPage() {
  // Auth
  const [user, setUser] = useState<StoreUser | null>(null);
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // PIN change
  const [showPinChange, setShowPinChange] = useState(false);
  const [pendingUser, setPendingUser] = useState<StoreUser | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeLoading, setPinChangeLoading] = useState(false);

  // Data
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Tab: pendientes (fulfilled) / entregados (shipped)
  const [tab, setTab] = useState<'pendientes' | 'entregados'>('pendientes');

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Traer pedidos fulfilled y shipped para filtrar por tienda
      const res = await fetch('/api/picking/store-orders?' + new URLSearchParams({ storeId: user.storeId }));
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchOrders();
  }, [user, fetchOrders]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (!pin || pin.length < 4) {
      setAuthError('Ingresá un PIN de 4 a 6 dígitos');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/picking/store-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.requirePinChange) {
          setPendingUser(data.user);
          setShowPinChange(true);
        } else {
          setUser(data.user);
        }
      } else {
        setAuthError(data.error || 'PIN incorrecto');
        setPin('');
      }
    } catch {
      setAuthError('Error de conexion');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handlePinChange(e: React.FormEvent) {
    e.preventDefault();
    setPinChangeError('');

    if (!newPin || !/^\d{6}$/.test(newPin)) {
      setPinChangeError('El nuevo PIN debe ser de exactamente 6 dígitos');
      return;
    }
    if (newPin !== confirmPin) {
      setPinChangeError('Los PINs no coinciden');
      return;
    }
    if (newPin === pin) {
      setPinChangeError('El nuevo PIN debe ser diferente al actual');
      return;
    }

    setPinChangeLoading(true);
    try {
      const res = await fetch('/api/picking/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUser?.id, currentPin: pin, newPin }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(pendingUser);
        setShowPinChange(false);
      } else {
        setPinChangeError(data.error || 'Error al cambiar PIN');
      }
    } catch {
      setPinChangeError('Error de conexión');
    } finally {
      setPinChangeLoading(false);
    }
  }

  async function handleDeliver(order: StoreOrder) {
    if (!user) return;
    const customerName = order.shipping_address?.first_name
      ? `${order.shipping_address.first_name} ${order.shipping_address.last_name || ''}`
      : 'el cliente';

    if (!confirm(`¿Confirmas la entrega del pedido #${order.display_id} a ${customerName}?`)) return;

    setDelivering(order.id);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/picking/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          orderDisplayId: order.display_id,
          userId: user.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Pedido #${order.display_id} entregado correctamente`);
        fetchOrders();
      } else {
        setErrorMsg(data.error || 'Error al entregar');
      }
    } catch {
      setErrorMsg('Error de conexion');
    } finally {
      setDelivering(null);
    }
  }

  // PIN Change Gate
  if (showPinChange && pendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center -mt-16">
        <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Hola {pendingUser.name}!</h1>
            <p className="text-sm text-gray-500 mt-1">Por seguridad, cambia tu PIN a <strong>6 digitos</strong></p>
          </div>
          <form onSubmit={handlePinChange} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Nuevo PIN (6 digitos)</label>
              <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="------" maxLength={6} inputMode="numeric" autoFocus
                className="w-full mt-1 px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Repetir nuevo PIN</label>
              <input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="------" maxLength={6} inputMode="numeric"
                className="w-full mt-1 px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>
            {pinChangeError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{pinChangeError}</span>
              </div>
            )}
            <button type="submit" disabled={pinChangeLoading || newPin.length !== 6 || confirmPin.length !== 6}
              className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-amber-700 transition-colors">
              {pinChangeLoading ? 'Guardando...' : 'Cambiar PIN y continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // PIN Gate
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center -mt-16">
        <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">🏪</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Portal de Tienda</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresa tu PIN de tienda</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="----"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{authError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading || pin.length < 4}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-emerald-700"
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

  const pendientes = orders.filter(o => o.fulfillment_status === 'fulfilled');
  const entregados = orders.filter(o => o.fulfillment_status === 'shipped' || o.fulfillment_status === 'partially_shipped' || o.fulfillment_status === 'delivered');
  const displayOrders = tab === 'pendientes' ? pendientes : entregados;

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-emerald-600 text-white px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">🏪 {user.storeName}</h1>
            <p className="text-xs text-emerald-100">{user.name}</p>
          </div>
          <button
            onClick={() => { setUser(null); setPin(''); setOrders([]); }}
            className="text-xs bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 rounded-lg transition-colors"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {/* Mensajes */}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span className="text-green-800 text-sm font-medium">{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <span className="text-lg">❌</span>
            <span className="text-red-800 text-sm font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('pendientes')}
            className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'pendientes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Pendientes ({pendientes.length})
          </button>
          <button
            onClick={() => setTab('entregados')}
            className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'entregados' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Entregados ({entregados.length})
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Lista vacia */}
        {!loading && displayOrders.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <span className="text-4xl block mb-2">{tab === 'pendientes' ? '📦' : '✅'}</span>
            <h3 className="text-sm font-medium text-gray-900">
              {tab === 'pendientes' ? 'No hay pedidos pendientes' : 'No hay pedidos entregados'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {tab === 'pendientes' ? 'Los pedidos para retirar apareceran aca' : 'Los pedidos entregados se mostraran aca'}
            </p>
          </div>
        )}

        {/* Lista de pedidos */}
        {!loading && displayOrders.length > 0 && (
          <div className="space-y-3">
            {displayOrders.map(order => {
              const customerName = order.shipping_address?.first_name
                ? `${order.shipping_address.first_name} ${order.shipping_address.last_name || ''}`.trim()
                : order.customer?.first_name
                  ? `${order.customer.first_name} ${order.customer.last_name || ''}`.trim()
                  : 'Sin nombre';
              const phone = order.shipping_address?.phone || order.customer?.phone || '';
              const email = order.email || order.customer?.email || '';
              const dni = order.shipping_address?.metadata?.dni || '';
              const totalItems = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
              const isDelivering = delivering === order.id;

              return (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header pedido */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">#{order.display_id}</span>
                      {tab === 'entregados' && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold">Entregado</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-green-600">{formatPrice(order.total)}</span>
                      <p className="text-[10px] text-gray-400">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Cliente */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 text-sm font-bold shrink-0">
                        {customerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900">{customerName}</p>
                        {dni && (
                          <p className="text-xs text-gray-500">DNI: {dni}</p>
                        )}
                        {phone && (
                          <a href={`tel:${phone}`} className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {phone}
                          </a>
                        )}
                        {email && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{email}</p>
                        )}
                      </div>
                    </div>

                    {/* Productos */}
                    {order.items && order.items.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Productos ({totalItems} item{totalItems !== 1 ? 's' : ''})
                        </p>
                        {order.items.map((item, idx) => {
                          const itemName = item.product_title || item.title || 'Producto';
                          const variant = item.variant_title && item.variant_title !== 'Default' ? item.variant_title : '';
                          return (
                            <div key={item.id || idx} className="flex items-center gap-2">
                              {item.thumbnail ? (
                                <img
                                  src={item.thumbnail}
                                  alt={itemName}
                                  className="w-10 h-10 rounded-lg object-cover border"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-lg">
                                  📦
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">{itemName}</p>
                                {variant && (
                                  <p className="text-[11px] text-gray-500">{variant}</p>
                                )}
                                {item.variant_sku && (
                                  <p className="text-[10px] text-gray-400 font-mono">SKU: {item.variant_sku}</p>
                                )}
                              </div>
                              <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded-md border shrink-0">
                                ×{item.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Botón entregar */}
                    {tab === 'pendientes' && (
                      <button
                        onClick={() => handleDeliver(order)}
                        disabled={isDelivering}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isDelivering ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Entregando...
                          </>
                        ) : (
                          <>✅ Marcar como Entregado</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Refresh */}
        {!loading && (
          <button
            onClick={fetchOrders}
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            🔄 Actualizar
          </button>
        )}
      </div>
    </div>
  );
}
