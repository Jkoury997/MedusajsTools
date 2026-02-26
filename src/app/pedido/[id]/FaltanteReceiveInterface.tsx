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

function getItemCode(item: LineItem): string {
  return item.variant?.product?.external_id || item.variant?.sku || '-';
}

export default function FaltanteReceiveInterface({ orderId, orderDisplayId, orderItems }: Props) {
  const [loading, setLoading] = useState(true);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [allReceived, setAllReceived] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [lastScannedName, setLastScannedName] = useState<string | null>(null);
  const [showWrongArticle, setShowWrongArticle] = useState(false);
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

    try {
      const res = await fetch('/api/gestion/faltantes/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, barcode: code }),
      });
      const data = await res.json();

      if (data.success) {
        setMissingItems(data.missingItems);
        setAllReceived(data.allReceived);
        feedback.success();

        // Highlight del item escaneado
        if (data.matched?.lineItemId) {
          setLastScannedId(data.matched.lineItemId);
          const oi = orderItems.find(o => o.id === data.matched.lineItemId);
          if (oi) {
            const name = getItemName(oi);
            const size = oi.variant?.metadata?.size;
            const color = oi.variant?.metadata?.color;
            const detail = [size, color].filter(Boolean).join(' - ');
            setLastScannedName(`${name}${detail ? ` (${detail})` : ''} — ${data.matched.quantityReceived}/${data.matched.quantityMissing}`);
          }
          setTimeout(() => { setLastScannedId(null); setLastScannedName(null); }, 2500);
        }

        if (data.allReceived) {
          feedback.allDone();
        }
      } else {
        setBarcodeInput('');
        setShowWrongArticle(true);
        feedback.error();
        setTimeout(() => {
          setShowWrongArticle(false);
          inputRef.current?.focus();
        }, 2000);
      }
    } catch {
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

  // === COMPLETED: Todos los faltantes recibidos ===
  if (allReceived) {
    return (
      <div className="print:hidden mt-4 space-y-3">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-800 mb-1">Faltantes Recibidos</h2>
          <p className="text-sm text-green-600 mb-2">Pedido #{orderDisplayId}</p>
          <p className="text-sm text-green-700 font-medium">
            Fulfillment creado en Medusa. El pedido está listo para enviar.
          </p>
        </div>

        <button
          onClick={() => { window.location.href = '/gestion'; }}
          className="w-full bg-indigo-600 text-white py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors shadow-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          Listo para enviar
        </button>
      </div>
    );
  }

  // === SCANNING: Interfaz principal ===
  return (
    <div className="print:hidden mt-4 space-y-3">
      {/* Header con progreso */}
      <div className="bg-yellow-600 text-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-yellow-200 uppercase tracking-wider font-semibold">Recibir faltantes</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-bold">Pedido #{orderDisplayId}</span>
          <span className="text-2xl font-mono font-bold">{totalReceived}/{totalMissing}</span>
        </div>

        {/* Progress bar */}
        <div className="bg-white/20 rounded-full h-3 overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-yellow-100">
            {totalReceived} de {totalMissing} faltantes recibidos
          </span>
          <span className="text-xs text-yellow-100">{progressPercent}%</span>
        </div>
      </div>

      {/* Barcode Scanner - Estilo oscuro como en picking */}
      <div className="bg-gray-900 rounded-xl p-4">
        <form onSubmit={handleScan} className="flex gap-2">
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
              placeholder="Escanear código de barras..."
              autoFocus
              className="w-full pl-10 pr-3 py-3.5 bg-white border-2 border-gray-300 rounded-xl text-base font-mono focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
            />
          </div>
          <button
            type="submit"
            disabled={!barcodeInput.trim() || scanning}
            className="px-5 py-3.5 bg-yellow-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 active:bg-yellow-600"
          >
            OK
          </button>
        </form>

        {/* Last scanned feedback */}
        {lastScannedName && (
          <div className="mt-2 bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-300 text-sm truncate">{lastScannedName}</span>
          </div>
        )}

        {/* Scanning indicator */}
        {scanning && (
          <div className="mt-2 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Procesando...
          </div>
        )}
      </div>

      {/* Wrong article popup */}
      {showWrongArticle && (
        <div className="bg-red-500 text-white rounded-xl p-4 text-center animate-pulse">
          <svg className="w-8 h-8 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <p className="font-bold text-lg">Artículo incorrecto</p>
          <p className="text-sm text-red-100">Este código no coincide con ningún faltante</p>
        </div>
      )}

      {/* Items list - Mismo estilo que picking */}
      <div className="space-y-1.5">
        {missingItems.map((mi) => {
          const oi = orderItems.find(o => o.id === mi.lineItemId);
          const isDone = mi.quantityReceived >= mi.quantityMissing;
          const isHighlighted = lastScannedId === mi.lineItemId;
          const itemName = oi ? getItemName(oi) : mi.sku || 'Producto';
          const itemCode = oi ? getItemCode(oi) : mi.sku;
          const color = oi?.variant?.metadata?.color;
          const size = oi?.variant?.metadata?.size;
          const thumbnail = oi?.variant?.product?.thumbnail;

          return (
            <div
              key={mi.lineItemId}
              className={`rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                isHighlighted
                  ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300'
                  : isDone
                    ? 'border-green-300 bg-green-50'
                    : 'bg-white border-gray-200'
              }`}
            >
              <div className="p-2.5 flex items-center gap-3">
                {/* Thumbnail */}
                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt={itemName}
                    className={`w-11 h-11 object-cover rounded-lg border flex-shrink-0 ${isDone ? 'opacity-50' : ''}`}
                  />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium line-clamp-1 ${
                    isDone ? 'text-green-700' : 'text-gray-900'
                  }`}>
                    {itemName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500 font-mono">{itemCode}</span>
                    {size && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{size}</span>}
                    {color && <span className="text-xs px-1 py-0.5 bg-gray-100 text-gray-700 rounded">{color}</span>}
                  </div>
                </div>

                {/* Counter */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className={`px-2.5 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    isDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-900'
                  }`}>
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      `${mi.quantityReceived}/${mi.quantityMissing}`
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
