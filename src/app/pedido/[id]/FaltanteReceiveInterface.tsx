'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { LineItem } from '@/lib/medusa';

interface MissingItem {
  lineItemId: string;
  sku: string;
  barcode: string;
  quantityMissing: number;
  quantityReceived: number;
}

interface Props {
  orderId: string;
  orderDisplayId: number;
  orderItems: LineItem[];
}

function useReceiveFeedback() {
  const audioCtx = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx.current;
  }, []);

  const playTone = useCallback((frequency: number, duration: number) => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      gain.gain.value = 0.3;
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio no disponible
    }
  }, [getAudioCtx]);

  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }, []);

  const success = useCallback(() => {
    playTone(880, 0.1);
    setTimeout(() => playTone(1100, 0.15), 120);
    vibrate(50);
  }, [playTone, vibrate]);

  const error = useCallback(() => {
    playTone(200, 0.3);
    vibrate([100, 50, 100]);
  }, [playTone, vibrate]);

  const allDone = useCallback(() => {
    playTone(523, 0.15);
    setTimeout(() => playTone(659, 0.15), 150);
    setTimeout(() => playTone(784, 0.15), 300);
    setTimeout(() => playTone(1047, 0.3), 450);
    vibrate([100, 50, 100, 50, 200]);
  }, [playTone, vibrate]);

  return { success, error, allDone };
}

function getItemName(item: LineItem): string {
  return item.variant?.product?.title || item.product_title || item.title || 'Producto';
}

export default function FaltanteReceiveInterface({ orderId, orderDisplayId, orderItems }: Props) {
  const [loading, setLoading] = useState(true);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [allReceived, setAllReceived] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useReceiveFeedback();

  // Cargar items faltantes
  useEffect(() => {
    async function fetchMissing() {
      try {
        const res = await fetch(`/api/gestion/faltantes/receive?orderId=${orderId}`);
        const data = await res.json();
        if (data.success) {
          const items = data.missingItems || [];
          // Solo mostrar si hay faltantes y el estado es waiting o pending
          const resolution = data.faltanteResolution;
          if (items.length > 0 && ['pending', 'waiting'].includes(resolution)) {
            setShouldShow(true);
            setMissingItems(items);
            const allDone = items.every(
              (i: MissingItem) => i.quantityReceived >= i.quantityMissing
            );
            setAllReceived(allDone);
          }
        }
      } catch {
        // Error silencioso
      } finally {
        setLoading(false);
      }
    }
    fetchMissing();
  }, [orderId]);

  // Focus automático en el input
  useEffect(() => {
    if (!loading && !allReceived) {
      inputRef.current?.focus();
    }
  }, [loading, allReceived]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code || scanning) return;

    setScanning(true);
    setScanMessage(null);

    try {
      const res = await fetch('/api/gestion/faltantes/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, barcode: code }),
      });
      const data = await res.json();

      if (data.success) {
        setMissingItems(data.missingItems);
        setLastScanned(data.matched.lineItemId);
        setAllReceived(data.allReceived);

        const oi = orderItems.find(o => o.id === data.matched.lineItemId);
        const name = oi ? getItemName(oi) : data.matched.sku || code;
        setScanMessage({
          type: 'success',
          text: `${name} (${data.matched.quantityReceived}/${data.matched.quantityMissing})`,
        });
        feedback.success();

        if (data.allReceived) {
          feedback.allDone();
        }

        // Limpiar highlight después de 2s
        setTimeout(() => setLastScanned(null), 2000);
      } else {
        setScanMessage({ type: 'error', text: data.error || 'Código no encontrado' });
        feedback.error();
      }
    } catch {
      setScanMessage({ type: 'error', text: 'Error de conexión' });
      feedback.error();
    } finally {
      setScanning(false);
      setBarcodeInput('');
      inputRef.current?.focus();
    }
  }

  if (loading) {
    return (
      <div className="print:hidden mt-4">
        <div className="w-full bg-yellow-50 py-4 rounded-xl flex items-center justify-center animate-pulse">
          <span className="text-yellow-600 text-sm">Cargando faltantes...</span>
        </div>
      </div>
    );
  }

  if (!shouldShow || missingItems.length === 0) return null;

  const totalMissing = missingItems.reduce((s, i) => s + i.quantityMissing, 0);
  const totalReceived = missingItems.reduce((s, i) => s + i.quantityReceived, 0);
  const progressPercent = totalMissing > 0 ? Math.round((totalReceived / totalMissing) * 100) : 0;

  return (
    <div className="print:hidden mt-4 space-y-3">
      {/* Header */}
      <div className={`${allReceived ? 'bg-green-600' : 'bg-yellow-600'} text-white rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
            {allReceived ? 'Faltantes completados' : 'Recibir mercadería faltante'}
          </span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-bold">Pedido #{orderDisplayId}</span>
          <span className="text-2xl font-mono font-bold">{totalReceived}/{totalMissing}</span>
        </div>

        {/* Barra de progreso */}
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allReceived ? 'bg-white' : 'bg-white/80'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Scanner input */}
      {!allReceived && (
        <form onSubmit={handleScan} className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                inputMode="none"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Escaneá el producto faltante..."
                autoFocus
                className="w-full pl-10 pr-4 py-3 border-2 border-yellow-300 rounded-xl text-lg font-mono focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              />
            </div>
          </div>
        </form>
      )}

      {/* Scan feedback */}
      {scanMessage && (
        <div className={`rounded-xl p-3 text-center text-sm font-medium ${
          scanMessage.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {scanMessage.type === 'success' ? '✓ ' : '✗ '}{scanMessage.text}
        </div>
      )}

      {/* Lista de items faltantes */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700">
          {allReceived ? 'Todos los faltantes recibidos' : 'Items faltantes'}
        </h3>
        {missingItems.map((mi) => {
          const oi = orderItems.find(o => o.id === mi.lineItemId);
          const isDone = mi.quantityReceived >= mi.quantityMissing;
          const isHighlighted = lastScanned === mi.lineItemId;

          return (
            <div
              key={mi.lineItemId}
              className={`rounded-xl border p-3 transition-all duration-300 ${
                isHighlighted
                  ? 'bg-yellow-50 border-yellow-300 scale-[1.02]'
                  : isDone
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex gap-3">
                {oi?.variant?.product?.thumbnail && (
                  <img
                    src={oi.variant.product.thumbnail}
                    alt=""
                    className="w-12 h-12 object-cover rounded-lg border flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                    {oi ? getItemName(oi) : mi.sku || mi.barcode}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {mi.barcode && (
                      <span className="text-xs text-gray-400 font-mono">{mi.barcode}</span>
                    )}
                    {oi?.variant?.metadata?.size && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {oi.variant.metadata.size}
                      </span>
                    )}
                    {oi?.variant?.metadata?.color && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                        {oi.variant.metadata.color}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center">
                  {isDone ? (
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-600">
                        {mi.quantityReceived}/{mi.quantityMissing}
                      </p>
                      <p className="text-xs text-gray-500">faltan</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón volver */}
      {allReceived && (
        <div className="space-y-3">
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
            <svg className="w-10 h-10 text-green-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-800 font-bold">Todos los faltantes fueron recibidos</p>
            <p className="text-green-600 text-sm mt-1">El pedido fue marcado como resuelto</p>
          </div>
          <button
            onClick={() => {
              const backUrl = new URLSearchParams(window.location.search).get('from');
              if (backUrl === 'gestion') {
                window.location.href = '/gestion';
              } else {
                window.location.href = '/';
              }
            }}
            className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a gestión
          </button>
        </div>
      )}
    </div>
  );
}
