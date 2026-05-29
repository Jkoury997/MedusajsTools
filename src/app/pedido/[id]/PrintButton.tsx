'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Alert, PinInput } from '@/components/ui';

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
  const router = useRouter();
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

    // Si no está preparado, verificar si ya hay sesión activa o completada
    try {
      const res = await fetch(`/api/picking/session/${orderId}?includeCompleted=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.session) {
          // Ya hay sesión (activa o completada), imprimir directo
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
        router.refresh();
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
        router.refresh();
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
      <Modal
        open={showPinChange}
        onClose={() => setShowPinChange(false)}
        title="Cambio de PIN requerido"
      >
        <p className="text-sm text-gray-500 mb-4 text-center">
          Hola <strong>{pendingUserName}</strong>, tu PIN debe ser de 6 dígitos
        </p>

        <form onSubmit={handlePinChangeAndContinue} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo PIN (6 dígitos)</label>
            <PinInput
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar PIN</label>
            <PinInput
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
            />
          </div>

          {pinChangeError && <Alert tone="error">{pinChangeError}</Alert>}

          <Button
            type="submit"
            disabled={pinChangeLoading || newPin.length < 6 || confirmPin.length < 6}
            loading={pinChangeLoading}
            fullWidth
            className="!bg-amber-600 hover:!bg-amber-700"
          >
            {pinChangeLoading ? 'Cambiando...' : 'Cambiar PIN e Imprimir'}
          </Button>
        </form>
      </Modal>

      {/* Modal PIN para imprimir */}
      <Modal
        open={showPinModal}
        onClose={() => { setShowPinModal(false); setPin(''); setPinError(''); }}
        title="Imprimir Pedido"
      >
        <p className="text-sm text-gray-500 mb-4 text-center">
          Ingresá tu PIN para empezar el picking e imprimir
        </p>

        <div className="mb-4">
          <Alert tone="warning">Al imprimir se inicia el conteo de tiempo del picking</Alert>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-3">
          <PinInput
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
          />

          {pinError && <Alert tone="error">{pinError}</Alert>}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || pin.length < 4}
              loading={loading}
              fullWidth
            >
              {loading ? 'Iniciando...' : 'Imprimir y Empezar'}
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
