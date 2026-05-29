'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AuthCard, PinInput, Button, Input, Alert, Card, Badge, Tabs, ConfirmDialog } from '@/components/ui';
import { formatPrice, formatDate } from '@/lib/format';

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

  // Confirmación de entrega
  const [confirmOrder, setConfirmOrder] = useState<StoreOrder | null>(null);

  // Tab: pendientes (fulfilled) / entregados (shipped)
  const [tab, setTab] = useState<'pendientes' | 'entregados'>('pendientes');

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Traer pedidos fulfilled y shipped para filtrar por tienda (sesión por cookie)
      const res = await fetch('/api/picking/store-orders?' + new URLSearchParams({ storeId: user.storeId }), {
        credentials: 'include',
      });
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
        // La sesión vive en una cookie httpOnly; solo guardamos datos no sensibles.
        const storeUser: StoreUser = data.user;
        if (data.requirePinChange) {
          setPendingUser(storeUser);
          setShowPinChange(true);
        } else {
          setUser(storeUser);
        }
      } else {
        setAuthError(data.error || 'PIN incorrecto');
        setPin('');
      }
    } catch {
      setAuthError('Error de conexión');
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
        setUser(pendingUser as StoreUser);
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

    setDelivering(order.id);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/picking/deliver', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          orderDisplayId: order.display_id,
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
      setErrorMsg('Error de conexión');
    } finally {
      setDelivering(null);
    }
  }

  // PIN Change Gate
  if (showPinChange && pendingUser) {
    return (
      <AuthCard
        icon="🔑"
        title={`¡Hola ${pendingUser.name}!`}
        subtitle="Por seguridad, cambiá tu PIN a 6 dígitos"
      >
        <form onSubmit={handlePinChange} className="space-y-4">
          <Input
            label="Nuevo PIN (6 dígitos)"
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder="------"
            maxLength={6}
            inputMode="numeric"
            autoFocus
            className="text-2xl text-center tracking-[0.5em]"
          />
          <Input
            label="Repetir nuevo PIN"
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            placeholder="------"
            maxLength={6}
            inputMode="numeric"
            className="text-2xl text-center tracking-[0.5em]"
          />
          {pinChangeError && <Alert tone="error">{pinChangeError}</Alert>}
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={pinChangeLoading}
            disabled={newPin.length !== 6 || confirmPin.length !== 6}
          >
            {pinChangeLoading ? 'Guardando...' : 'Cambiar PIN y continuar'}
          </Button>
        </form>
      </AuthCard>
    );
  }

  // PIN Gate
  if (!user) {
    return (
      <AuthCard
        icon="🏪"
        title="Portal de Tienda"
        subtitle="Ingresá tu PIN de tienda"
        footer={
          <Link href="/" className="text-sm text-gray-400 hover:text-brand-600 transition-colors">
            Volver al inicio
          </Link>
        }
      >
        <form onSubmit={handleAuth} className="space-y-4">
          <PinInput
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            autoFocus
          />
          {authError && <Alert tone="error">{authError}</Alert>}
          <Button type="submit" fullWidth size="lg" loading={authLoading} disabled={pin.length < 4}>
            {authLoading ? 'Verificando...' : 'Ingresar'}
          </Button>
        </form>
      </AuthCard>
    );
  }

  const pendientes = orders.filter(o => o.fulfillment_status === 'fulfilled');
  const entregados = orders.filter(o => o.fulfillment_status === 'shipped' || o.fulfillment_status === 'partially_shipped' || o.fulfillment_status === 'delivered');
  const displayOrders = tab === 'pendientes' ? pendientes : entregados;

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-brand-500 text-white px-4 py-3.5 -mx-4 sm:-mx-6 lg:-mx-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">🏪 {user.storeName}</h1>
            <p className="text-xs text-white/80">{user.name}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/15 shrink-0"
            onClick={async () => {
              try { await fetch('/api/picking/login', { method: 'DELETE', credentials: 'include' }); } catch {}
              setUser(null); setPin(''); setOrders([]);
            }}
          >
            Salir
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {/* Mensajes */}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}
        {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

        {/* Tabs */}
        <Tabs
          tabs={[
            { id: 'pendientes', label: 'Pendientes', count: pendientes.length },
            { id: 'entregados', label: 'Entregados', count: entregados.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'pendientes' | 'entregados')}
        />

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-2/3" />
              </Card>
            ))}
          </div>
        )}

        {/* Lista vacía */}
        {!loading && displayOrders.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 text-center">
            <span className="text-5xl block mb-3">{tab === 'pendientes' ? '📦' : '✅'}</span>
            <h3 className="text-sm font-semibold text-gray-900">
              {tab === 'pendientes' ? 'No hay pedidos pendientes' : 'No hay pedidos entregados'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {tab === 'pendientes' ? 'Los pedidos para retirar aparecerán acá' : 'Los pedidos entregados se mostrarán acá'}
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
                  : order.email || order.customer?.email || 'Sin nombre';
              const phone = order.shipping_address?.phone || order.customer?.phone || '';
              const email = order.email || order.customer?.email || '';
              const dni = order.shipping_address?.metadata?.dni || '';
              const totalItems = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
              const isDelivering = delivering === order.id;

              return (
                <Card key={order.id} padding={false} className="overflow-hidden">
                  {/* Header pedido */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">#{order.display_id}</span>
                      {tab === 'entregados' && <Badge tone="success">Entregado</Badge>}
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-600">{formatPrice(order.total)}</span>
                      <p className="text-[10px] text-gray-400">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Cliente */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
                        {customerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900">{customerName}</p>
                        {dni && (
                          <p className="text-xs text-gray-500">DNI: {dni}</p>
                        )}
                        {phone && (
                          <a href={`tel:${phone}`} className="text-xs text-brand-600 flex items-center gap-1 mt-0.5">
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
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
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
                                  className="w-10 h-10 rounded-lg object-cover border border-gray-200"
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
                              <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded-md border border-gray-200 shrink-0">
                                ×{item.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Botón entregar */}
                    {tab === 'pendientes' && (
                      <Button
                        variant="success"
                        fullWidth
                        size="lg"
                        loading={isDelivering}
                        onClick={() => setConfirmOrder(order)}
                      >
                        {isDelivering ? 'Entregando...' : '✅ Marcar como Entregado'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Refresh */}
        {!loading && (
          <Button variant="secondary" fullWidth size="lg" onClick={fetchOrders}>
            🔄 Actualizar
          </Button>
        )}
      </div>

      {/* Confirmación de entrega */}
      <ConfirmDialog
        open={confirmOrder !== null}
        title="Confirmar entrega"
        message={
          confirmOrder
            ? `¿Confirmás la entrega del pedido #${confirmOrder.display_id} a ${
                confirmOrder.shipping_address?.first_name
                  ? `${confirmOrder.shipping_address.first_name} ${confirmOrder.shipping_address.last_name || ''}`
                  : 'el cliente'
              }?`
            : ''
        }
        confirmLabel="Marcar como entregado"
        tone="success"
        loading={confirmOrder !== null && delivering === confirmOrder.id}
        onConfirm={() => {
          const order = confirmOrder;
          setConfirmOrder(null);
          if (order) handleDeliver(order);
        }}
        onCancel={() => setConfirmOrder(null)}
      />
    </div>
  );
}
