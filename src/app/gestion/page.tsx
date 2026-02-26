'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type TabId = 'preparados' | 'faltantes' | 'por-enviar' | 'enviados';

interface MissingItem {
  lineItemId: string;
  sku?: string;
  barcode?: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityMissing: number;
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
  missingItems: MissingItem[];
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
  itemCount: number;
  session: SessionInfo | null;
  logs?: AuditLogEntry[];
}

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const tabs: TabConfig[] = [
  {
    id: 'preparados',
    label: 'Preparado',
    color: 'green',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  {
    id: 'faltantes',
    label: 'Faltantes',
    color: 'red',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'por-enviar',
    label: 'Por Enviar',
    color: 'yellow',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
  {
    id: 'enviados',
    label: 'Enviado',
    color: 'blue',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
];

function formatPrice(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ==================== TAB COMPONENTS ====================

function PreparadoCard({ order }: { order: OrderData }) {
  const hasMissing = (order.session?.totalMissing || 0) > 0;

  return (
    <Link href={`/pedido/${order.id}?from=gestion`} className="block">
      <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
        hasMissing ? 'border-orange-300' : 'border-gray-100'
      }`}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
            {hasMissing && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500 text-white">
                Con faltantes
              </span>
            )}
          </div>
          <span className="text-lg font-bold text-green-600">{formatPrice(order.total)}</span>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-900 truncate">{order.customerName}</span>
          </div>

          {order.session && (
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              <span>Armó: {order.session.userName}</span>
              {order.session.durationSeconds && (
                <span>{formatDuration(order.session.durationSeconds)}</span>
              )}
              <span className="ml-auto font-bold text-green-600">
                {order.session.totalPicked}/{order.session.totalRequired}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatWhatsAppNumber(phone: string): string {
  let cleanNumber = phone.replace(/\D/g, '');
  if (cleanNumber.startsWith('54')) return cleanNumber;
  if (cleanNumber.startsWith('0')) cleanNumber = cleanNumber.substring(1);
  if (cleanNumber.startsWith('15')) cleanNumber = cleanNumber.substring(2);
  if (cleanNumber.length === 10) return `54${cleanNumber}`;
  if (cleanNumber.length === 8) return `5411${cleanNumber}`;
  return `54${cleanNumber}`;
}

function FaltanteCard({ order, onResolve, onRefresh }: { order: OrderData; onResolve: (orderId: string, resolution: string, notes: string) => void; onRefresh: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'choose' | 'voucher' | 'voucher-result'>('choose');
  const [notes, setNotes] = useState('');
  const [voucherValue, setVoucherValue] = useState('');
  const [resolving, setResolving] = useState(false);
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
        alert(data.error || 'Error al crear voucher');
      }
    } catch {
      alert('Error de conexión');
    } finally {
      setResolving(false);
    }
  }

  function getWhatsAppUrl() {
    if (!voucherResult?.phone) return '';
    const waNumber = formatWhatsAppNumber(voucherResult.phone);
    const message = encodeURIComponent(
      `Hola ${voucherResult.customerName}! Te escribimos de Marcela Koury por tu pedido #${voucherResult.orderDisplayId}. Lamentamos que algunos artículos no estuvieron disponibles. Te generamos un voucher de compensación por $${voucherResult.value}. Tu código es: *${voucherResult.code}* Podés usarlo en tu próxima compra. Disculpá las molestias!`
    );
    return `https://wa.me/${waNumber}?text=${message}`;
  }

  function closeModal() {
    setShowModal(false);
    setModalStep('choose');
    setNotes('');
    setVoucherValue('');
    setVoucherResult(null);
    if (voucherResult) {
      onRefresh();
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
              {order.session?.totalMissing} faltante{(order.session?.totalMissing || 0) !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-lg font-bold text-green-600">{formatPrice(order.total)}</span>
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

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => { setShowModal(true); setModalStep('voucher'); }}
              className="py-2.5 bg-purple-500 text-white rounded-xl text-sm font-bold active:bg-purple-600 flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
              Voucher
            </button>
            <button
              onClick={() => { setShowModal(true); setModalStep('choose'); }}
              className="py-2.5 bg-yellow-500 text-white rounded-xl text-sm font-bold active:bg-yellow-600 flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Esperar
            </button>
          </div>
        </div>
      </div>

      {/* Resolution Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">

            {/* Step: Choose (waiting confirmation) */}
            {modalStep === 'choose' && (
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Esperar mercadería</h3>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm mb-4 resize-none h-16 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />

                <button
                  onClick={handleWaiting}
                  disabled={resolving}
                  className="w-full py-3 bg-yellow-500 text-white rounded-xl text-sm font-bold active:bg-yellow-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {resolving ? 'Guardando...' : 'Confirmar espera'}
                </button>
              </div>
            )}

            {/* Step: Voucher value input */}
            {modalStep === 'voucher' && (
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-1">Crear voucher</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Pedido #{order.displayId} — {order.session?.totalMissing} artículo{(order.session?.totalMissing || 0) !== 1 ? 's' : ''} faltante{(order.session?.totalMissing || 0) !== 1 ? 's' : ''}
                </p>

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

                <button
                  onClick={handleVoucher}
                  disabled={resolving || !voucherValue || Number(voucherValue) <= 0}
                  className="w-full py-3 bg-purple-500 text-white rounded-xl text-sm font-bold active:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                  {resolving ? 'Creando...' : `Crear voucher por ${voucherValue ? formatPrice(Number(voucherValue)) : '$0'}`}
                </button>
              </div>
            )}

            {/* Step: Voucher result + WhatsApp */}
            {modalStep === 'voucher-result' && voucherResult && (
              <div className="p-5">
                <div className="text-center mb-4">
                  <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-green-800">Voucher creado</h3>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center mb-4">
                  <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">Código del voucher</p>
                  <p className="text-2xl font-mono font-bold text-purple-900 tracking-wider">{voucherResult.code}</p>
                  <p className="text-lg font-bold text-purple-700 mt-1">{formatPrice(voucherResult.value)}</p>
                </div>

                {voucherResult.phone ? (
                  <a
                    href={getWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-green-500 text-white rounded-xl text-sm font-bold active:bg-green-600 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Enviar por WhatsApp
                  </a>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                    <p className="text-sm text-gray-500">Sin número de teléfono disponible</p>
                    <p className="text-xs text-gray-400 mt-1">Copiá el código y envialo manualmente</p>
                  </div>
                )}
              </div>
            )}

            <div className="border-t">
              <button
                onClick={closeModal}
                disabled={resolving}
                className="w-full py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {modalStep === 'voucher-result' ? 'Cerrar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PorEnviarCard({ order }: { order: OrderData }) {
  const resolution = order.session?.faltanteResolution;
  const hasFaltantesResolved = resolution && resolution !== 'pending';
  const isWaiting = resolution === 'waiting';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
          {order.session?.packed && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500 text-white">
              Empacado
            </span>
          )}
          {hasFaltantesResolved && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              resolution === 'voucher' ? 'bg-purple-500 text-white' :
              resolution === 'resolved' ? 'bg-green-500 text-white' :
              'bg-yellow-500 text-white'
            }`}>
              {resolution === 'voucher' ? 'Voucher' :
               resolution === 'resolved' ? 'Stock recibido' :
               'Esperando stock'}
            </span>
          )}
        </div>
        <span className="text-lg font-bold text-green-600">{formatPrice(order.total)}</span>
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

        <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">{formatDate(order.createdAt)}</span>
          <div className="flex items-center gap-2">
            {isWaiting && (
              <Link
                href={`/gestion/recibir/${order.id}`}
                className="px-3 py-1 bg-yellow-500 text-white rounded-full text-xs font-bold active:bg-yellow-600 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Recibir
              </Link>
            )}
            <Link
              href={`/pedido/${order.id}?from=gestion`}
              className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-full"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-bold text-blue-600">{order.itemCount}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnviadoCard({ order }: { order: OrderData }) {
  const [showLogs, setShowLogs] = useState(false);
  const isDelivered = order.fulfillmentStatus === 'delivered';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">#{order.displayId}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            isDelivered ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
          }`}>
            {isDelivered ? 'Entregado' : 'Enviado'}
          </span>
        </div>
        <span className="text-lg font-bold text-green-600">{formatPrice(order.total)}</span>
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

        {/* Stats summary */}
        {order.session && (
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-500">Items</p>
              <p className="text-sm font-bold text-gray-900">{order.session.totalPicked}/{order.session.totalRequired}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Tiempo</p>
              <p className="text-sm font-bold text-gray-900">
                {order.session.durationSeconds ? formatDuration(order.session.durationSeconds) : '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Picker</p>
              <p className="text-sm font-bold text-gray-900 truncate">{order.session.userName}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Link
            href={`/pedido/${order.id}?from=gestion`}
            className="flex-1 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold text-center active:bg-blue-600"
          >
            Ver pedido
          </Link>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              showLogs ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
          >
            Logs
          </button>
        </div>

        {/* Audit logs */}
        {showLogs && order.logs && order.logs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 max-h-48 overflow-y-auto">
            {order.logs.map((log) => (
              <div key={log._id} className="flex items-start gap-2 text-xs">
                <span className="text-gray-400 flex-shrink-0 w-24">{formatDate(log.createdAt)}</span>
                <span className="font-medium text-gray-700">{log.userName}</span>
                <span className="text-gray-500 truncate">{log.details || log.action}</span>
              </div>
            ))}
          </div>
        )}

        {showLogs && (!order.logs || order.logs.length === 0) && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-center text-xs text-gray-400 py-2">
            Sin registros de auditoría
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabId }) {
  const messages: Record<TabId, { title: string; subtitle: string }> = {
    preparados: { title: 'No hay pedidos preparados', subtitle: 'Los pedidos aparecerán aquí cuando se complete el picking' },
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
  const [activeTab, setActiveTab] = useState<TabId>('preparados');
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  async function handleResolveFaltante(orderId: string, resolution: string, notes: string) {
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
        alert(data.error || 'Error al resolver');
      }
    } catch {
      alert('Error de conexión');
    }
  }

  function getTabClasses(tab: TabConfig, isActive: boolean) {
    if (isActive) {
      switch (tab.color) {
        case 'green': return 'bg-green-500 text-white border-green-500';
        case 'red': return 'bg-red-500 text-white border-red-500';
        case 'yellow': return 'bg-yellow-500 text-white border-yellow-500';
        case 'blue': return 'bg-blue-600 text-white border-blue-600';
        default: return 'bg-gray-500 text-white border-gray-500';
      }
    }
    return 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';
  }

  const tabTitles: Record<TabId, string> = {
    preparados: 'Pedidos Preparados',
    faltantes: 'Pedidos con Faltantes',
    'por-enviar': 'Por Enviar',
    enviados: 'Enviados',
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 active:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h2 className="text-lg font-bold text-gray-900">{tabTitles[activeTab]}</h2>
          </div>
          <button
            onClick={() => fetchData(activeTab)}
            className="p-2 text-gray-400 hover:text-gray-600 active:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = counts[tab.id];

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center px-1 py-2 rounded-lg border text-xs font-medium transition-colors ${getTabClasses(tab, isActive)}`}
              >
                {tab.icon}
                <span className="mt-1 leading-tight">{tab.label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white/20' : 'bg-gray-100'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between">
                  <div className="h-6 bg-gray-200 rounded w-20" />
                  <div className="h-6 bg-gray-200 rounded w-24" />
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800 font-medium text-sm">Error</p>
            <p className="text-red-600 text-xs mt-1">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {orders.length} pedido{orders.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((order) => {
                switch (activeTab) {
                  case 'preparados':
                    return <PreparadoCard key={order.id} order={order} />;
                  case 'faltantes':
                    return <FaltanteCard key={order.id} order={order} onResolve={handleResolveFaltante} onRefresh={() => fetchData(activeTab)} />;
                  case 'por-enviar':
                    return <PorEnviarCard key={order.id} order={order} />;
                  case 'enviados':
                    return <EnviadoCard key={order.id} order={order} />;
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
