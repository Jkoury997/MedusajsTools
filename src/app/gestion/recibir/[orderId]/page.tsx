'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// === FEEDBACK: Sonido + Vibración ===
function useScanFeedback() {
  const audioCtx = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx.current;
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
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

  const successFeedback = useCallback(() => {
    playTone(880, 0.1);
    setTimeout(() => playTone(1320, 0.15), 100);
    vibrate(100);
  }, [playTone, vibrate]);

  const errorFeedback = useCallback(() => {
    playTone(200, 0.3, 'square');
    vibrate([100, 50, 100, 50, 200]);
  }, [playTone, vibrate]);

  const completeFeedback = useCallback(() => {
    playTone(523, 0.1);
    setTimeout(() => playTone(659, 0.1), 120);
    setTimeout(() => playTone(784, 0.1), 240);
    setTimeout(() => playTone(1047, 0.2), 360);
    vibrate([100, 50, 100, 50, 300]);
  }, [playTone, vibrate]);

  return { successFeedback, errorFeedback, completeFeedback };
}

interface MissingItem {
  lineItemId: string;
  sku: string;
  barcode: string;
  quantityMissing: number;
  quantityReceived: number;
}

export default function RecibirPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orderDisplayId, setOrderDisplayId] = useState(0);
  const [items, setItems] = useState<MissingItem[]>([]);
  const [allReceived, setAllReceived] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanResult, setScanResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const { successFeedback, errorFeedback, completeFeedback } = useScanFeedback();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/gestion/faltantes/receive?orderId=${orderId}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.missingItems);
        setOrderDisplayId(data.orderDisplayId);
        setAllReceived(data.faltanteResolution === 'resolved');
      } else {
        setError(data.error || 'Error al cargar datos');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Enfocar input de barcode
  useEffect(() => {
    if (!loading && !allReceived && barcodeRef.current) {
      barcodeRef.current.focus();
    }
  }, [loading, allReceived]);

  async function handleScan(input: string) {
    if (!input.trim() || scanning) return;

    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch('/api/gestion/faltantes/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          barcode: input.trim(),
          sku: input.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setItems(data.missingItems);
        setScanResult({
          type: 'success',
          message: `${data.matched.sku || data.matched.barcode} — ${data.matched.quantityReceived}/${data.matched.quantityMissing}`,
        });
        successFeedback();

        if (data.allReceived) {
          setAllReceived(true);
          completeFeedback();
        }
      } else {
        setScanResult({ type: 'error', message: data.error });
        errorFeedback();
      }
    } catch {
      setScanResult({ type: 'error', message: 'Error de conexión' });
      errorFeedback();
    } finally {
      setBarcodeInput('');
      setScanning(false);
      barcodeRef.current?.focus();
    }
  }

  function handleManualReceive(lineItemId: string) {
    handleScan('');
    // Para manual, enviar lineItemId directamente
    fetch('/api/gestion/faltantes/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, lineItemId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setItems(data.missingItems);
          setScanResult({
            type: 'success',
            message: `Recibido manualmente: ${data.matched.sku || data.matched.barcode}`,
          });
          successFeedback();
          if (data.allReceived) {
            setAllReceived(true);
            completeFeedback();
          }
        } else {
          setScanResult({ type: 'error', message: data.error });
          errorFeedback();
        }
      })
      .catch(() => {
        setScanResult({ type: 'error', message: 'Error de conexión' });
        errorFeedback();
      });
  }

  const totalMissing = items.reduce((sum, i) => sum + i.quantityMissing, 0);
  const totalReceived = items.reduce((sum, i) => sum + i.quantityReceived, 0);
  const progressPercent = totalMissing > 0 ? Math.round((totalReceived / totalMissing) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-medium">{error}</p>
          <Link href="/gestion" className="text-sm text-red-600 underline mt-2 inline-block">
            Volver a gestión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/gestion" className="text-gray-400 active:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Recibir Faltantes</h2>
              <p className="text-xs text-gray-500">Pedido #{orderDisplayId}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-bold text-yellow-600">{totalReceived}/{totalMissing}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allReceived ? 'bg-green-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Completed state */}
      {allReceived && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-green-800">Mercadería recibida completa</h3>
          <p className="text-sm text-green-600 mt-1">
            Todos los artículos faltantes fueron recibidos
          </p>
          <Link
            href="/gestion"
            className="inline-block mt-4 px-6 py-2.5 bg-green-500 text-white rounded-xl font-bold active:bg-green-600"
          >
            Volver a gestión
          </Link>
        </div>
      )}

      {/* Scanner */}
      {!allReceived && (
        <div className="mt-4">
          {/* Barcode input */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Escanear código de barras
            </label>
            <div className="flex gap-2 mt-2">
              <input
                ref={barcodeRef}
                type="text"
                inputMode="none"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScan(barcodeInput);
                  }
                }}
                placeholder="Escaneá el producto..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                autoFocus
                disabled={scanning}
              />
              <button
                onClick={() => handleScan(barcodeInput)}
                disabled={scanning || !barcodeInput.trim()}
                className="px-4 py-3 bg-yellow-500 text-white rounded-xl font-bold active:bg-yellow-600 disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scan result toast */}
          {scanResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              scanResult.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {scanResult.type === 'success' ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {scanResult.message}
            </div>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide px-1">
          Artículos faltantes
        </h3>

        {items.map((item, idx) => {
          const isComplete = item.quantityReceived >= item.quantityMissing;

          return (
            <div
              key={idx}
              className={`bg-white rounded-xl border overflow-hidden transition-all ${
                isComplete ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {item.sku || item.barcode || item.lineItemId}
                      </p>
                      {item.barcode && item.sku && (
                        <p className="text-xs text-gray-500">Código: {item.barcode}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${isComplete ? 'text-green-600' : 'text-yellow-600'}`}>
                    {item.quantityReceived}/{item.quantityMissing}
                  </span>

                  {!isComplete && !allReceived && (
                    <button
                      onClick={() => handleManualReceive(item.lineItemId)}
                      className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-bold active:bg-yellow-600"
                    >
                      +1
                    </button>
                  )}
                </div>
              </div>

              {/* Progress mini bar */}
              {!isComplete && (
                <div className="px-4 pb-2">
                  <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full transition-all"
                      style={{ width: `${(item.quantityReceived / item.quantityMissing) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
