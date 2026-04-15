'use client';

import { useState } from 'react';

interface DeliverButtonProps {
  orderId: string;
  orderDisplayId: number;
  customerName: string;
  isFactoryPickup: boolean;
  isStorePickup: boolean;
  isSentToStore: boolean;
  fulfillmentStatus: string;
}

export default function DeliverButton({ orderId, orderDisplayId, customerName, isFactoryPickup, isStorePickup, isSentToStore, fulfillmentStatus }: DeliverButtonProps) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [delivered, setDelivered] = useState(false);

  // Mostrar si:
  // 1. Retiro en fábrica + fulfilled (flujo actual)
  // 2. Retiro en tienda + enviado a tienda (isSentToStore) + fulfilled (nuevo flujo)
  const showForFactory = isFactoryPickup && fulfillmentStatus === 'fulfilled';
  const showForStore = isStorePickup && isSentToStore && fulfillmentStatus === 'fulfilled';

  if ((!showForFactory && !showForStore) || delivered) return null;

  const pickupLabel = isFactoryPickup ? 'Retiro en Fábrica' : 'Retiro en Tienda';
  const buttonColor = isFactoryPickup ? 'purple' : 'blue';

  async function handleDeliver() {
    setPinError('');
    if (!pin || pin.length < 4) {
      setPinError('Ingresá tu PIN');
      return;
    }

    setLoading(true);
    try {
      // Autenticar
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

      // Entregar
      const res = await fetch('/api/picking/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          orderDisplayId,
          userId: authData.user.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDelivered(true);
        setShowPinModal(false);
        setPin('');
        // Recargar para actualizar el estado
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setPinError(data.error || 'Error al entregar');
      }
    } catch {
      setPinError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (delivered) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center print:hidden">
        <span className="text-green-700 font-semibold">Pedido entregado correctamente</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setShowPinModal(true); setPin(''); setPinError(''); }}
        className={`w-full ${buttonColor === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white py-4 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 print:hidden`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Entregar al cliente ({pickupLabel})
      </button>

      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">
            <div className="p-5">
              <div className="text-center mb-4">
                <div className={`w-14 h-14 ${buttonColor === 'purple' ? 'bg-purple-100' : 'bg-blue-100'} rounded-full flex items-center justify-center mx-auto mb-2`}>
                  <svg className={`w-7 h-7 ${buttonColor === 'purple' ? 'text-purple-600' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Entregar Pedido</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Pedido #{orderDisplayId} a <strong>{customerName}</strong>
                </p>
              </div>

              <div className={`${buttonColor === 'purple' ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-2.5 mb-4`}>
                <p className={`text-xs ${buttonColor === 'purple' ? 'text-purple-800' : 'text-blue-800'} text-center font-medium`}>
                  {pickupLabel} — Ingresá tu PIN para confirmar
                </p>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleDeliver(); }} className="space-y-3">
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  className={`w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 ${buttonColor === 'purple' ? 'focus:ring-purple-500 focus:border-purple-500' : 'focus:ring-blue-500 focus:border-blue-500'}`}
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
                    className={`flex-1 ${buttonColor === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors`}
                  >
                    {loading ? 'Entregando...' : 'Confirmar Entrega'}
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
