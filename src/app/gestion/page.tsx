'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import { Card, Button, Badge, Alert, Tabs, Modal, ConfirmDialog } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { printStoreLabel } from '@/lib/store-label';

type TabId = 'por-preparar' | 'faltantes' | 'por-enviar' | 'enviados';

interface MissingItem {
  lineItemId: string;
  sku?: string;
  barcode?: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityMissing: number;
  unitPrice?: number;
}

interface AuditLogEntry {
  _id: string;
  action: string;
  userName: string;
  details?: string;
  createdAt: string;
}

interface SessionInfo {
  totalRequired: number;
  totalPicked: number;
  totalMissing: number;
  packed: boolean;
  packedAt?: string;
  userName: string;
  completedAt?: string;
  durationSeconds?: number;
  faltanteResolution?: string | null;
  faltanteResolvedAt?: string;
  faltanteNotes?: string;
  voucherCode?: string;
  voucherValue?: number;
  missingItems: MissingItem[];
}

interface InProgressSession {
  userName: string;
  totalRequired: number;
  totalPicked: number;
  progressPercent: number;
  startedAt: string;
}

interface OrderData {
  id: string;
  displayId: number;
  email: string;
  total: number;
  createdAt: string;
  customerName: string;
  address: string | null;
  province: string | null;
  fulfillmentStatus: string;
  shippingMethod: string | null;
  isExpress: boolean;
  itemCount: number;
  isStorePickup: boolean;
  customerPhone: string | null;
  storeName: string | null;
  storeAddress: string | null;
  isCashPayment: boolean;
  /** true si la orden viene de Mercado Libre */
  isMercadoLibre: boolean;
  /** ID del envío en ML — para descargar etiqueta de Mercado Envíos */
  mlShipmentId: number | null;
  /** ID de la orden en ML */
  mlOrderId: number | null;
  /** Estado del envío en ML (ready_to_ship, shipped, delivered) */
  mlShipmentStatus: string | null;
  /** Número de tracking de ML */
  mlTrackingNumber: string | null;
  session: SessionInfo | null;
  inProgressSession: InProgressSession | null;
  logs?: AuditLogEntry[];
}

const TAB_LABELS: Record<TabId, string> = {
  'por-preparar': 'Preparar',
  faltantes: 'Faltantes',
  'por-enviar': 'Por Enviar',
  enviados: 'Enviado',
};

// Olas obligatorio: gestión queda como pantalla de despacho. El armado (Preparar)
// se hace por Olas y los faltantes se resuelven en /faltantes, así que esas dos
// tabs se ocultan (el switch las mantiene por compatibilidad / deep-links viejos).
const TAB_ORDER: TabId[] = ['por-enviar', 'enviados'];

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ==================== TAB COMPONENTS ====================

function PorPrepararCard({ order }: { order: OrderData }) {
  const inProgress = order.inProgressSession;

  return (
    <Link href={`/pedido/${order.id}?from=gestion`} className="block">
      <Card padding={false} className={`active:shadow-md transition-all overflow-hidden ${
        order.isExpress
          ? 'border-orange-400 ring-1 ring-orange-200'
          : order.isCashPayment
            ? 'border-emerald-400 ring-1 ring-emerald-200'
            : inProgress
              ? 'border-blue-300 ring-1 ring-blue-200'
              : ''
      }`}>
        {/* Banners superiores */}
        {(order.isExpress || order.isCashPayment || order.isMercadoLibre) && (
          <div className="flex">
            {/* Banner de Mercado Libre — amarillo con logo de ML */}
            {order.isMercadoLibre && (
              <div className="bg-yellow-400 text-gray-900 px-4 py-1.5 flex items-center gap-1.5 flex-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider">Mercado Libre</span>
              </div>
            )}
            {order.isExpress && (
              <div className="bg-orange-500 text-white px-4 py-1.5 flex items-center gap-1.5 flex-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider">Envío Rápido</span>
              </div>
            )}
            {order.isCashPayment && (
              <div className="bg-emerald-600 text-white px-4 py-1.5 flex items-center gap-1.5 flex-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider">Efectivo</span>
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
            <Badge tone="danger">Sin Preparar</Badge>
          </div>
          <span className="text-lg font-bold text-brand-600">{formatPrice(order.total)}</span>
        </div>

        {/* Picking en curso */}
        {inProgress && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {inProgress.userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-blue-700">Armando: {inProgress.userName}</span>
            </div>
            <div className="bg-blue-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all"
                style={{ width: `${inProgress.progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-blue-500 mt-0.5 block">{inProgress.progressPercent}% completado</span>
          </div>
        )}

        {/* Contenido */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900 truncate">{order.customerName}</span>
          </div>

          {order.address && (
            <div className="flex items-start gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-gray-600 line-clamp-1">{order.address}</span>
            </div>
          )}

          {order.shippingMethod && (
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              <span className={`text-xs font-medium truncate ${
                order.isExpress ? 'text-orange-600 font-bold' : 'text-gray-500'
              }`}>
                {order.shippingMethod}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">{formatDate(order.createdAt)}</span>
            <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-full">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-bold text-blue-600">{order.itemCount}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function FaltanteCard({ order, onResolve, onRefresh }: { order: OrderData; onResolve: (orderId: string, resolution: string, notes: string) => void; onRefresh: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'choose' | 'voucher' | 'voucher-result'>('choose');
  const [notes, setNotes] = useState('');
  const [voucherValue, setVoucherValue] = useState('');
  const [resolving, setResolving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [voucherResult, setVoucherResult] = useState<{
    code: string;
    value: number;
    customerName: string;
    phone: string;
    orderDisplayId: number;
  } | null>(null);

  async function handleWaiting() {
    setResolving(true);
    await onResolve(order.id, 'waiting', notes);
    setResolving(false);
    setShowModal(false);
    setNotes('');
  }

  async function handleVoucher() {
    if (!voucherValue || Number(voucherValue) <= 0) return;

    setResolving(true);
    setModalError('');
    try {
      const res = await fetch('/api/gestion/faltantes/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          value: Number(voucherValue),
          notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVoucherResult({
          code: data.giftCard.code,
          value: data.giftCard.value,
          customerName: data.customer.name,
          phone: data.customer.phone,
          orderDisplayId: data.orderDisplayId,
        });
        setModalStep('voucher-result');
      } else {
        setModalError(data.error || 'Error al crear voucher');
      }
    } catch {
      setModalError('Error de conexión');
    } finally {
      setResolving(false);
    }
  }

  function getWhatsAppMessage() {
    if (!voucherResult) return '';
    return `Hola ${voucherResult.customerName}! Te escribimos de Marcela Koury por tu pedido #${voucherResult.orderDisplayId}. Lamentamos que algunos artículos no estuvieron disponibles. Te generamos un voucher de compensación por $${voucherResult.value}. Tu código es: *${voucherResult.code}* Podés usarlo en tu próxima compra. Disculpá las molestias!`;
  }

  function getWhatsAppUrl() {
    if (!voucherResult) return '';
    const message = getWhatsAppMessage();
    if (voucherResult.phone) {
      return buildWhatsAppUrl(voucherResult.phone, message);
    }
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  async function copyWhatsAppMessage() {
    const msg = getWhatsAppMessage();
    if (msg) {
      await navigator.clipboard.writeText(msg);
    }
  }

  function closeModal() {
    setShowModal(false);
    setModalStep('choose');
    setNotes('');
    setVoucherValue('');
    setModalError('');
    setVoucherResult(null);
    if (voucherResult) {
      onRefresh();
    }
  }

  const isWaiting = order.session?.faltanteResolution === 'waiting';

  return (
    <>
      <Card padding={false} className={`overflow-hidden ${isWaiting ? 'border-amber-200' : 'border-red-200'}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isWaiting ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
            <Badge tone={isWaiting ? 'warning' : 'danger'}>
              {isWaiting ? 'Esperando' : `${order.session?.totalMissing} faltante${(order.session?.totalMissing || 0) !== 1 ? 's' : ''}`}
            </Badge>
          </div>
          <span className="text-lg font-bold text-brand-600">{formatPrice(order.total)}</span>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900 truncate">{order.customerName}</span>
          </div>

          {/* Missing items list */}
          {order.session?.missingItems && order.session.missingItems.length > 0 && (
            <div className="mt-2 space-y-1">
              {order.session.missingItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-red-50 rounded-lg px-3 py-1.5">
                  <span className="font-mono text-red-700">{item.sku || item.barcode || item.lineItemId}</span>
                  <span className="text-red-600 font-bold">-{item.quantityMissing}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ver pedido */}
          <Link
            href={`/pedido/${order.id}?from=gestion`}
            className="block mt-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium text-center active:bg-gray-200 flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Ver pedido
          </Link>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              variant="primary"
              size="sm"
              fullWidth
              className="bg-purple-500 hover:bg-purple-600"
              onClick={() => {
                // Pre-calcular valor del voucher basado en precio de items faltantes
                const missingValue = (order.session?.missingItems || []).reduce(
                  (sum, item) => sum + (item.unitPrice || 0) * item.quantityMissing, 0
                );
                if (missingValue > 0) setVoucherValue(String(missingValue));
                setModalError('');
                setShowModal(true);
                setModalStep('voucher');
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              Voucher
            </Button>
            {isWaiting ? (
              <Link
                href={`/pedido/${order.id}?from=gestion`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Recibir
              </Link>
            ) : (
              <Button
                variant="primary"
                size="sm"
                fullWidth
                className="bg-amber-500 hover:bg-amber-600"
                onClick={() => { setModalError(''); setShowModal(true); setModalStep('choose'); }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Esperar
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Resolution Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={modalStep === 'choose' ? 'Esperar mercadería' : modalStep === 'voucher' ? 'Crear voucher' : 'Voucher creado'}
        footer={
          <Button variant="ghost" onClick={closeModal} disabled={resolving}>
            {modalStep === 'voucher-result' ? 'Cerrar' : 'Cancelar'}
          </Button>
        }
      >
        {modalError && <Alert tone="error" className="mb-4">{modalError}</Alert>}

        {/* Step: Choose (waiting confirmation) */}
        {modalStep === 'choose' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Pedido #{order.displayId} — {order.session?.totalMissing} artículo{(order.session?.totalMissing || 0) !== 1 ? 's' : ''} faltante{(order.session?.totalMissing || 0) !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Cuando la mercadería llegue, vas a poder escanear los artículos para confirmar la recepción.
            </p>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm mb-4 resize-none h-16 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />

            <Button
              variant="primary"
              fullWidth
              loading={resolving}
              className="bg-amber-500 hover:bg-amber-600"
              onClick={handleWaiting}
            >
              {!resolving && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {resolving ? 'Guardando...' : 'Confirmar espera'}
            </Button>
          </div>
        )}

        {/* Step: Voucher value input */}
        {modalStep === 'voucher' && (
          <div>
            <p className="text-sm text-gray-500 mb-2">
              Pedido #{order.displayId} — {order.session?.totalMissing} artículo{(order.session?.totalMissing || 0) !== 1 ? 's' : ''} faltante{(order.session?.totalMissing || 0) !== 1 ? 's' : ''}
            </p>

            {/* Desglose del valor de faltantes */}
            {order.session?.missingItems && order.session.missingItems.some(i => i.unitPrice) && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 mb-3 text-xs">
                {order.session.missingItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-purple-800">
                    <span>{item.sku || item.barcode || 'Item'} x{item.quantityMissing}</span>
                    <span className="font-medium">{formatPrice((item.unitPrice || 0) * item.quantityMissing)}</span>
                  </div>
                ))}
              </div>
            )}

            <label className="text-sm font-medium text-gray-700 block mb-1">
              Valor del voucher
            </label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-bold">$</span>
              <input
                type="number"
                value={voucherValue}
                onChange={(e) => setVoucherValue(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                autoFocus
              />
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm mb-4 resize-none h-16 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />

            <Button
              variant="primary"
              fullWidth
              loading={resolving}
              disabled={!voucherValue || Number(voucherValue) <= 0}
              className="bg-purple-500 hover:bg-purple-600"
              onClick={handleVoucher}
            >
              {!resolving && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              )}
              {resolving ? 'Creando...' : `Crear voucher por ${voucherValue ? formatPrice(Number(voucherValue)) : '$0'}`}
            </Button>
          </div>
        )}

        {/* Step: Voucher result + WhatsApp */}
        {modalStep === 'voucher-result' && voucherResult && (
          <div>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-emerald-800">Voucher creado</h3>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center mb-4">
              <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">Código del voucher</p>
              <p className="text-2xl font-mono font-bold text-purple-900 tracking-wider">{voucherResult.code}</p>
              <p className="text-lg font-bold text-purple-700 mt-1">{formatPrice(voucherResult.value)}</p>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                {voucherResult.phone ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}
              </a>
              <Button variant="secondary" fullWidth onClick={copyWhatsAppMessage}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar mensaje
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function PorEnviarCard({ order, onRefresh }: { order: OrderData; onRefresh: () => void }) {
  const [shipping, setShipping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmShip, setConfirmShip] = useState(false);
  const [shipError, setShipError] = useState('');
  const resolution = order.session?.faltanteResolution;
  const hasFaltantesResolved = resolution && !['pending', 'waiting'].includes(resolution);

  // Datos del voucher: leer campos estructurados de la sesión y, solo si no
  // existen (datos viejos), recurrir al parseo por regex de faltanteNotes.
  const voucherInfo = (() => {
    if (resolution !== 'voucher') return null;
    const code = order.session?.voucherCode;
    if (code) {
      const value = order.session?.voucherValue;
      return { code, value: value != null ? String(value) : '' };
    }
    // Fallback para sesiones antiguas sin campos estructurados.
    if (!order.session?.faltanteNotes) return null;
    const codeMatch = order.session.faltanteNotes.match(/Voucher:\s*([\w-]+)/);
    const valueMatch = order.session.faltanteNotes.match(/Valor:\s*\$(\d+)/);
    if (!codeMatch) return null;
    return { code: codeMatch[1], value: valueMatch ? valueMatch[1] : '' };
  })();

  function getVoucherMessage() {
    if (!voucherInfo) return '';
    return `Hola ${order.customerName}! Te escribimos de Marcela Koury por tu pedido #${order.displayId}. Lamentamos que algunos artículos no estuvieron disponibles. Te generamos un voucher de compensación por $${voucherInfo.value}. Tu código es: *${voucherInfo.code}* Podés usarlo en tu próxima compra. Disculpá las molestias!`;
  }

  function getVoucherWhatsAppUrl() {
    if (!voucherInfo) return '';
    const msg = getVoucherMessage();
    if (order.customerPhone) {
      return buildWhatsAppUrl(order.customerPhone, msg);
    }
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  async function copyVoucherMessage() {
    if (!voucherInfo) return;
    await navigator.clipboard.writeText(getVoucherMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShip() {
    if (shipping) return;
    setConfirmShip(false);
    setShipError('');
    setShipping(true);
    try {
      const res = await fetch('/api/gestion/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, orderDisplayId: order.displayId }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        setShipError(data.error || 'Error al enviar');
      }
    } catch {
      setShipError('Error de conexión');
    } finally {
      setShipping(false);
    }
  }

  return (
    <Card padding={false} className={`overflow-hidden ${
      order.isExpress ? 'border-orange-400 ring-1 ring-orange-200' : order.isCashPayment ? 'border-emerald-400 ring-1 ring-emerald-200' : ''
    }`}>
      {/* Banners superiores */}
      {(order.isExpress || order.isCashPayment) && (
        <div className="flex">
          {order.isExpress && (
            <div className="bg-orange-500 text-white px-4 py-1.5 flex items-center gap-1.5 flex-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider">Envío Rápido</span>
            </div>
          )}
          {order.isCashPayment && (
            <div className="bg-emerald-600 text-white px-4 py-1.5 flex items-center gap-1.5 flex-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider">Efectivo</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
          {order.session?.packed && (
            <Badge tone="success">Empacado</Badge>
          )}
          {hasFaltantesResolved && (
            <Badge tone={resolution === 'voucher' ? 'purple' : 'success'}>
              {resolution === 'voucher' ? 'Voucher' : 'Stock recibido'}
            </Badge>
          )}
        </div>
        <span className="text-lg font-bold text-brand-600">{formatPrice(order.total)}</span>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-sm font-medium text-gray-900 truncate">{order.customerName}</span>
        </div>

        {order.address && (
          <div className="flex items-start gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-600 line-clamp-1">{order.address}</span>
          </div>
        )}

        {order.shippingMethod && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
            <span className="text-xs text-gray-500 truncate">{order.shippingMethod}</span>
          </div>
        )}

        {/* Voucher WhatsApp */}
        {voucherInfo && (
          <div className="mt-3 p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-semibold text-purple-700">Voucher: {voucherInfo.code}</span>
              {voucherInfo.value && <span className="text-xs text-purple-500">(${voucherInfo.value})</span>}
            </div>
            <div className="flex gap-1.5">
              <a
                href={getVoucherWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center justify-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              <button
                onClick={copyVoucherMessage}
                className="py-2 px-3 bg-white text-purple-700 rounded-lg text-xs font-bold active:bg-purple-100 flex items-center justify-center gap-1 border border-purple-200"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {/* Imprimir etiqueta de tienda */}
        {order.isStorePickup && order.storeName && (
          <button
            onClick={() => printStoreLabel({
              orderDisplayId: order.displayId,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              storeName: order.storeName!,
              storeAddress: order.storeAddress || '',
              isCashPayment: order.isCashPayment,
              orderTotal: order.total,
            })}
            className="w-full mt-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-semibold active:bg-purple-100 flex items-center justify-center gap-1.5 border border-purple-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Imprimir Etiqueta
          </button>
        )}

        {/* Imprimir etiqueta de Mercado Envíos (órdenes de Mercado Libre) */}
        {order.isMercadoLibre && order.mlShipmentId && (
          <a
            href={`/api/picking/ml-label?shipmentId=${order.mlShipmentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full mt-3 py-2 bg-yellow-400 text-gray-900 rounded-xl text-sm font-bold active:bg-yellow-500 flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Etiqueta Mercado Envíos
          </a>
        )}

        {shipError && <Alert tone="error" className="mt-3">{shipError}</Alert>}

        {/* Marcar como enviado */}
        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
          <Button
            variant="primary"
            fullWidth
            loading={shipping}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={() => setConfirmShip(true)}
          >
            {!shipping && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            )}
            {shipping ? 'Enviando...' : 'Marcar Enviado'}
          </Button>
          <Link
            href={`/pedido/${order.id}?from=gestion`}
            className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Ver
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmShip}
        title="Marcar como enviado"
        message={`¿Marcar pedido #${order.displayId} como enviado?`}
        confirmLabel="Marcar Enviado"
        loading={shipping}
        onConfirm={handleShip}
        onCancel={() => setConfirmShip(false)}
      />
    </Card>
  );
}

function EnviadoCard({ order, onRefresh }: { order: OrderData; onRefresh: () => void }) {
  const [delivering, setDelivering] = useState(false);
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [deliverError, setDeliverError] = useState('');

  async function handleDeliver() {
    if (delivering) return;
    setConfirmDeliver(false);
    setDeliverError('');
    setDelivering(true);
    try {
      const res = await fetch('/api/gestion/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, orderDisplayId: order.displayId }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        setDeliverError(data.error || 'Error al marcar como entregado');
      }
    } catch {
      setDeliverError('Error de conexión');
    } finally {
      setDelivering(false);
    }
  }

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
          <Badge tone="info">Enviado</Badge>
        </div>
        <span className="text-lg font-bold text-brand-600">{formatPrice(order.total)}</span>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-sm font-medium text-gray-900 truncate">{order.customerName}</span>
        </div>

        {order.address && (
          <div className="flex items-start gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-600 line-clamp-1">{order.address}</span>
          </div>
        )}

        {order.shippingMethod && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
            <span className="text-xs text-gray-500 truncate">{order.shippingMethod}</span>
          </div>
        )}

        {deliverError && <Alert tone="error" className="mt-3">{deliverError}</Alert>}

        {/* Marcar como entregado */}
        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
          <Button
            variant="success"
            fullWidth
            loading={delivering}
            className="flex-1"
            onClick={() => setConfirmDeliver(true)}
          >
            {!delivering && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {delivering ? 'Marcando...' : 'Marcar Entregado'}
          </Button>
          <Link
            href={`/pedido/${order.id}?from=gestion`}
            className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Ver
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeliver}
        title="Marcar como entregado"
        message={`¿Marcar pedido #${order.displayId} como entregado?`}
        confirmLabel="Marcar Entregado"
        tone="success"
        loading={delivering}
        onConfirm={handleDeliver}
        onCancel={() => setConfirmDeliver(false)}
      />
    </Card>
  );
}

function EmptyState({ tab }: { tab: TabId }) {
  const messages: Record<TabId, { title: string; subtitle: string }> = {
    'por-preparar': { title: 'Todo preparado', subtitle: 'No hay pedidos pendientes de preparar' },
    faltantes: { title: 'Sin faltantes pendientes', subtitle: 'No hay pedidos con artículos faltantes por resolver' },
    'por-enviar': { title: 'Nada por enviar', subtitle: 'Los pedidos listos aparecerán aquí' },
    enviados: { title: 'Sin envíos', subtitle: 'Los pedidos enviados aparecerán aquí' },
  };

  const msg = messages[tab];

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <h3 className="mt-2 text-sm font-medium text-gray-900">{msg.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{msg.subtitle}</p>
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function GestionPage() {
  const [activeTab, setActiveTab] = useState<TabId>('por-enviar');
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMl, setOnlyMl] = useState(false);

  const fetchData = useCallback(async (tab: TabId) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/gestion?tab=${tab}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
        setCounts(data.counts || {});
      } else {
        setError(data.error || 'Error al cargar datos');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  // Deep-link desde el Home (?tab=por-enviar|enviados).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'por-enviar' || t === 'enviados') setActiveTab(t);
  }, []);

  async function handleResolveFaltante(orderId: string, resolution: string, notes: string) {
    setActionError('');
    try {
      const res = await fetch('/api/gestion/faltantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, resolution, notes }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData(activeTab);
      } else {
        setActionError(data.error || 'Error al resolver');
      }
    } catch {
      setActionError('Error de conexión');
    }
  }

  // Cantidad de órdenes ML en la pestaña actual (para el contador del filtro)
  const mlCount = orders.filter(o => o.isMercadoLibre).length;

  // Filter orders by search + filtro "Solo Mercado Libre"
  const filteredOrders = orders.filter(o => {
    if (onlyMl && !o.isMercadoLibre) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      String(o.displayId).includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.address && o.address.toLowerCase().includes(q)) ||
      (o.province && o.province.toLowerCase().includes(q)) ||
      (o.shippingMethod && o.shippingMethod.toLowerCase().includes(q))
    );
  });

  // Sort: express orders first in por-enviar
  const sortedOrders = activeTab === 'por-enviar'
    ? [...filteredOrders].sort((a, b) => (b.isExpress ? 1 : 0) - (a.isExpress ? 1 : 0))
    : filteredOrders;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        {/* Back + reload + logout */}
        <div className="flex items-center gap-2">
          <Link href="/" className="text-gray-400 active:text-gray-600 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <Tabs
              tabs={TAB_ORDER.map((id) => ({ id, label: TAB_LABELS[id], count: counts[id] }))}
              active={activeTab}
              onChange={(id) => { setActiveTab(id as TabId); setSearch(''); }}
            />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/olas"
              className="px-2.5 py-1.5 text-xs font-semibold text-brand-700 bg-brand-100 hover:bg-brand-200 rounded-lg transition-colors"
            >
              Olas
            </Link>
            <Link
              href="/admin/auditoria"
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Admin
            </Link>
            <button
              onClick={() => fetchData(activeTab)}
              className="p-2 text-gray-400 hover:text-gray-600 active:bg-gray-100 rounded-lg"
              aria-label="Recargar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <LogoutButton />
          </div>
        </div>

        {/* Search */}
        <div className="mt-2 relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por #, nombre, dirección..."
            className="w-full pl-9 pr-8 py-2 bg-gray-100 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filtro: Solo Mercado Libre */}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setOnlyMl(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
              onlyMl
                ? 'bg-yellow-400 text-gray-900 border-yellow-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
            aria-pressed={onlyMl}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>
            </svg>
            Solo Mercado Libre
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${onlyMl ? 'bg-gray-900/15' : 'bg-gray-100'}`}>{mlCount}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {actionError && <Alert tone="error" className="mb-3">{actionError}</Alert>}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} padding={false} className="overflow-hidden animate-pulse">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between">
                  <div className="h-6 bg-gray-200 rounded w-20" />
                  <div className="h-6 bg-gray-200 rounded w-24" />
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : sortedOrders.length === 0 ? (
          search ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-500">No se encontraron resultados para &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <EmptyState tab={activeTab} />
          )
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {sortedOrders.length} pedido{sortedOrders.length !== 1 ? 's' : ''}
              {search && orders.length !== sortedOrders.length && ` (de ${orders.length})`}
              {(activeTab === 'por-preparar' || activeTab === 'por-enviar') && (() => {
                const expressCount = sortedOrders.filter(o => o.isExpress).length;
                return expressCount > 0 ? (
                  <span className="text-orange-600 font-semibold ml-1">
                    ({expressCount} rápido{expressCount !== 1 ? 's' : ''})
                  </span>
                ) : null;
              })()}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedOrders.map((order) => {
                switch (activeTab) {
                  case 'por-preparar':
                    return <PorPrepararCard key={order.id} order={order} />;
                  case 'faltantes':
                    return <FaltanteCard key={order.id} order={order} onResolve={handleResolveFaltante} onRefresh={() => fetchData(activeTab)} />;
                  case 'por-enviar':
                    return <PorEnviarCard key={order.id} order={order} onRefresh={() => fetchData(activeTab)} />;
                  case 'enviados':
                    return <EnviadoCard key={order.id} order={order} onRefresh={() => fetchData(activeTab)} />;
                  default:
                    return null;
                }
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
