'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Alert, PinInput } from '@/components/ui';

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
  const router = useRouter();
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
  const accentClass = isFactoryPickup ? '!bg-purple-600 hover:!bg-purple-700' : '!bg-blue-600 hover:!bg-blue-700';

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
        setTimeout(() => router.refresh(), 1000);
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
      <div className="print:hidden">
        <Alert tone="success">Pedido entregado correctamente</Alert>
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={() => { setShowPinModal(true); setPin(''); setPinError(''); }}
        fullWidth
        size="lg"
        className={`${accentClass} print:hidden`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Entregar al cliente ({pickupLabel})
      </Button>

      <Modal
        open={showPinModal}
        onClose={() => { setShowPinModal(false); setPin(''); setPinError(''); }}
        title="Entregar Pedido"
      >
        <div className="text-center mb-4">
          <p className="text-sm text-gray-500">
            Pedido #{orderDisplayId} a <strong>{customerName}</strong>
          </p>
        </div>

        <div className={`${isFactoryPickup ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-blue-50 border-blue-200 text-blue-800'} border rounded-lg p-2.5 mb-4`}>
          <p className="text-xs text-center font-medium">
            {pickupLabel} — Ingresá tu PIN para confirmar
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleDeliver(); }} className="space-y-3">
          <PinInput
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            autoFocus
          />

          {pinError && <Alert tone="error">{pinError}</Alert>}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || pin.length < 4}
              loading={loading}
              fullWidth
              className={accentClass}
            >
              {loading ? 'Entregando...' : 'Confirmar Entrega'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowPinModal(false); setPin(''); setPinError(''); }}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
