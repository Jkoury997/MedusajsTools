'use client';

import { useState } from 'react';

interface OrderItem {
  id: string;
  title: string;
  product_title?: string;
  quantity: number;
  variant?: {
    id: string;
    sku?: string | null;
    barcode?: string | null;
    title?: string;
    metadata?: { size?: string; color?: string };
    product?: { title?: string; external_id?: string; thumbnail?: string | null };
  } | null;
}

interface PrintButtonProps {
  orderId: string;
  orderDisplayId: number;
  orderItems: OrderItem[];
  fulfillmentStatus: string;
}

export default function PrintButton({ orderId, orderDisplayId, orderItems, fulfillmentStatus }: PrintButtonProps) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);

  // PIN change
  const [showPinChange, setShowPinChange] = useState(false);
  const [pendingUserId, setPendingUserId] = useState('');
  const [pendingUserName, setPendingUserName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeLoading, setPinChangeLoading] = useState(false);

  const isAlreadyFulfilled = fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'shipped' || fulfillmentStatus === 'partially_shipped' || fulfillmentStatus === 'delivered';

  async function handlePrintClick() {
    // Si ya está preparado/enviado, imprimir directamente
    if (isAlreadyFulfilled) {
      window.print();
      return;
    }

    // Si no está preparado, primero verificar si ya hay sesión activa
    try {
      const res = await fetch(`/api/picking/session/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.session) {
          // Ya hay sesión activa, imprimir directo
          window.print();
          return;
        }
      }
    } catch {
      // No hay sesión, seguir con el flujo de PIN
    }

    // Pedir PIN para empezar sesión
    setShowPinModal(true);
    setPin('');
    setPinError('');
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError('');

    if (!pin || pin.length < 4) {
      setPinError('Ingresá tu PIN de 4 a 6 dígitos');
      return;
    }

    setLoading(true);
    try {
      // 1. Autenticar PIN
      const authRes = await fetch('/api/picking/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const authData = await authRes.json();

      if (!authData.success) {
        setPinError(authData.error || 'PIN incorrecto');
        setPin('');
        setLoading(false);
        return;
      }

      // Si necesita cambiar PIN, mostrar formulario
      if (authData.requirePinChange) {
        setPendingUserId(authData.user.id);
        setPendingUserName(authData.user.name);
        setShowPinChange(true);
        setLoading(false);
        return;
      }

      // 2. Iniciar sesión de picking
      const items = orderItems.map(item => ({
        lineItemId: item.id,
        variantId: item.variant?.id,
        sku: item.variant?.sku || undefined,
        barcode: item.variant?.barcode || undefined,
        quantityRequired: item.quantity,
      }));

      const sessionRes = await fetch(`/api/picking/session/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authData.user.id, orderDisplayId, items }),
      });
      const sessionData = await sessionRes.json();

      if (!sessionData.success) {
        setPinError(sessionData.error || 'Error al iniciar sesión');
        setLoading(false);
        return;
      }

      // 3. Sesión creada, cerrar modal e imprimir
      setShowPinModal(false);
      setPin('');

      // Pequeño delay para que el modal se cierre antes de imprimir
      setTimeout(() => {
        window.print();
        // Recargar la página para que PickingInterface detecte la sesión activa
        window.location.reload();
      }, 200);

    } catch {
      setPinError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handlePinChangeAndContinue(e: React.FormEvent) {
    e.preventDefault();
    setPinChangeError('');

    if (!/^\d{6}$/.test(newPin)) {
      setPinChangeError('El nuevo PIN debe ser de 6 dígitos');
      return;
    }
    if (newPin !== confirmPin) {
      setPinChangeError('Los PINs no coinciden');
      return;
    }

    setPinChangeLoading(true);
    try {
      const res = await fetch('/api/picking/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, currentPin: pin, newPin }),
      });
      const data = await res.json();

      if (!data.success) {
        setPinChangeError(data.error || 'Error al cambiar PIN');
        setPinChangeLoading(false);
        return;
      }

      // PIN cambiado, ahora crear sesión e imprimir
      const items = orderItems.map(item => ({
        lineItemId: item.id,
        variantId: item.variant?.id,
        sku: item.variant?.sku || undefined,
        barcode: item.variant?.barcode || undefined,
        quantityRequired: item.quantity,
      }));

      const sessionRes = await fetch(`/api/picking/session/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, orderDisplayId, items }),
      });
      const sessionData = await sessionRes.json();

      if (!sessionData.success) {
        setPinChangeError(sessionData.error || 'Error al iniciar sesión');
        setPinChangeLoading(false);
        return;
      }

      // Cerrar modales e imprimir
      setShowPinChange(false);
      setShowPinModal(false);
      setPin('');
      setNewPin('');
      setConfirmPin('');

      setTimeout(() => {
        window.print();
        window.location.reload();
      }, 200);
    } catch {
      setPinChangeError('Error de conexión');
    } finally {
      setPinChangeLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handlePrintClick}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors print:hidden"
        aria-label="Imprimir"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
      </button>

      {/* Modal cambio de PIN */}
      {showPinChange && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Cambio de PIN requerido</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Hola <strong>{pendingUserName}</strong>, tu PIN debe ser de 6 dígitos
                </p>
              </div>

              <form onSubmit={handlePinChangeAndContinue} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo PIN (6 dígitos)</label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar PIN</label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                {pinChangeError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                    <span className="text-red-700 text-sm">{pinChangeError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pinChangeLoading || newPin.length < 6 || confirmPin.length < 6}
                  className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-amber-700"
                >
                  {pinChangeLoading ? 'Cambiando...' : 'Cambiar PIN e Imprimir'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal PIN para imprimir */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Imprimir Pedido</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Ingresá tu PIN para empezar el picking e imprimir
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-800">
                    Al imprimir se inicia el conteo de tiempo del picking
                  </p>
                </div>
              </div>

              <form onSubmit={handlePinSubmit} className="space-y-3">
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                {pinError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                    <span className="text-red-700 text-sm">{pinError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || pin.length < 4}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-blue-700"
                  >
                    {loading ? 'Iniciando...' : 'Imprimir y Empezar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPinModal(false); setPin(''); setPinError(''); }}
                    disabled={loading}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
