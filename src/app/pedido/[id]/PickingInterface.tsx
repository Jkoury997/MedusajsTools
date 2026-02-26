'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// === FEEDBACK: Sonido + Vibración ===
function usePickingFeedback() {
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
    } catch {
      // Vibración no disponible
    }
  }, []);

  const successFeedback = useCallback(() => {
    // Beep agudo doble (éxito)
    playTone(880, 0.1);
    setTimeout(() => playTone(1320, 0.15), 100);
    vibrate(100);
  }, [playTone, vibrate]);

  const errorFeedback = useCallback(() => {
    // Buzz grave (error)
    playTone(200, 0.3, 'square');
    vibrate([100, 50, 100, 50, 200]);
  }, [playTone, vibrate]);

  const completeFeedback = useCallback(() => {
    // Melodía de completado
    playTone(523, 0.1);
    setTimeout(() => playTone(659, 0.1), 120);
    setTimeout(() => playTone(784, 0.1), 240);
    setTimeout(() => playTone(1047, 0.2), 360);
    vibrate([100, 50, 100, 50, 300]);
  }, [playTone, vibrate]);

  return { successFeedback, errorFeedback, completeFeedback };
}

interface PickingItem {
  lineItemId: string;
  variantId?: string;
  sku?: string;
  barcode?: string;
  quantityRequired: number;
  quantityPicked: number;
  quantityMissing?: number;
  scanMethod?: string;
}

interface SessionData {
  id: string;
  orderId: string;
  orderDisplayId: number;
  status: string;
  startedAt: string;
  userName: string;
  items: PickingItem[];
  totalRequired: number;
  totalPicked: number;
  totalMissing: number;
  isComplete: boolean;
  progressPercent: number;
  elapsedSeconds: number;
}

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

interface MissingItemResult {
  lineItemId: string;
  sku?: string;
  barcode?: string;
  quantityMissing?: number;
}

interface CompletionResult {
  durationFormatted: string;
  userName: string;
  fulfillmentCreated: boolean;
  fulfillmentError?: string;
  packed?: boolean;
  totalMissing?: number;
  missingItems?: MissingItemResult[];
}

interface PickingInterfaceProps {
  orderId: string;
  orderDisplayId: number;
  orderItems: OrderItem[];
  fulfillmentStatus: string;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getItemName(item: OrderItem): string {
  return item.variant?.product?.title || item.product_title || item.title || 'Producto';
}

function getItemCode(item: OrderItem): string {
  return item.variant?.product?.external_id || item.variant?.sku || '-';
}

export default function PickingInterface({ orderId, orderDisplayId, orderItems, fulfillmentStatus }: PickingInterfaceProps) {
  // States
  const [step, setStep] = useState<'idle' | 'auth' | 'pinChange' | 'picking' | 'completed'>('idle');
  const [checkingSession, setCheckingSession] = useState(true);
  const [pickerPin, setPickerPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  // PIN change
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeLoading, setPinChangeLoading] = useState(false);

  // Session
  const [session, setSession] = useState<SessionData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pickError, setPickError] = useState('');

  // Barcode
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [lastScannedItemId, setLastScannedItemId] = useState<string | null>(null);
  const [lastScannedName, setLastScannedName] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [showWrongArticlePopup, setShowWrongArticlePopup] = useState(false);

  // Completion
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);

  // Packing (listo para enviar)
  const [packing, setPacking] = useState(false);
  const [packed, setPacked] = useState(false);

  // Cancel con razón obligatoria
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Feedback sonido + vibración
  const { successFeedback, errorFeedback, completeFeedback } = usePickingFeedback();

  // Timer
  useEffect(() => {
    if (step !== 'picking' || !session) return;
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, session]);

  // Auto-focus barcode input when entering picking mode
  useEffect(() => {
    if (step === 'picking') {
      setTimeout(() => barcodeRef.current?.focus(), 300);
    }
  }, [step]);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function checkExistingSession() {
    // No buscar sesión activa si la orden ya está fulfilled
    if (['fulfilled', 'shipped', 'partially_shipped', 'delivered'].includes(fulfillmentStatus)) {
      setCheckingSession(false);
      return;
    }

    try {
      const res = await fetch(`/api/picking/session/${orderId}`);
      const data = await res.json();
      if (data.success && data.session) {
        setSession(data.session);
        setElapsed(data.session.elapsedSeconds || 0);
        setUserName(data.session.userName);
        if (data.session.userId) setUserId(data.session.userId);
        setStep('picking');
      }
      // 404 = no hay sesión activa, es normal — no hacemos nada
    } catch {
      // Error de red
    } finally {
      setCheckingSession(false);
    }
  }

  // PIN Auth
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (!pickerPin || pickerPin.length < 4) {
      setAuthError('Ingresá tu PIN de 4 a 6 dígitos');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/picking/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pickerPin }),
      });
      const data = await res.json();

      if (data.success) {
        setUserId(data.user.id);
        setUserName(data.user.name);
        if (data.requirePinChange) {
          setStep('pinChange');
        } else {
          await startSession(data.user.id);
        }
      } else {
        setAuthError(data.error || 'PIN incorrecto');
        setPickerPin('');
      }
    } catch {
      setAuthError('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  // Cambio de PIN obligatorio
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
    if (newPin === pickerPin) {
      setPinChangeError('El nuevo PIN debe ser diferente al actual');
      return;
    }

    setPinChangeLoading(true);
    try {
      const res = await fetch('/api/picking/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, currentPin: pickerPin, newPin }),
      });
      const data = await res.json();

      if (data.success) {
        setPickerPin(newPin);
        await startSession(userId);
      } else {
        setPinChangeError(data.error || 'Error al cambiar PIN');
      }
    } catch {
      setPinChangeError('Error de conexión');
    } finally {
      setPinChangeLoading(false);
    }
  }

  // Start session
  async function startSession(uid: string) {
    try {
      const items = orderItems.map(item => ({
        lineItemId: item.id,
        variantId: item.variant?.id,
        sku: item.variant?.sku || undefined,
        barcode: item.variant?.barcode || undefined,
        quantityRequired: item.quantity,
      }));

      const res = await fetch(`/api/picking/session/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, orderDisplayId, items }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setElapsed(data.session.elapsedSeconds || 0);
        setStep('picking');
      } else {
        setAuthError(data.error || 'Error al iniciar sesión');
      }
    } catch {
      setAuthError('Error de conexión');
    }
  }

  // Pick +1
  const handlePick = useCallback(async (lineItemId: string) => {
    if (actionLoading) return;
    setActionLoading(lineItemId);
    setPickError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId, method: 'manual' }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(prev => prev ? { ...prev, ...data.session } : prev);
        successFeedback();
      } else {
        setPickError(data.error);
        errorFeedback();
        setTimeout(() => setPickError(''), 3000);
      }
    } catch {
      setPickError('Error de conexión');
      errorFeedback();
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, orderId, successFeedback, errorFeedback]);

  // Unpick -1
  const handleUnpick = useCallback(async (lineItemId: string) => {
    if (actionLoading) return;
    setActionLoading(`unpick-${lineItemId}`);
    setPickError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}/unpick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(prev => prev ? { ...prev, ...data.session } : prev);
      } else {
        setPickError(data.error);
        setTimeout(() => setPickError(''), 3000);
      }
    } catch {
      setPickError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, orderId]);

  // Mark item as missing (faltante)
  const handleMissing = useCallback(async (lineItemId: string, quantity: number) => {
    if (actionLoading) return;
    setActionLoading(`missing-${lineItemId}`);
    setPickError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}/missing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId, quantity }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(prev => prev ? { ...prev, ...data.session } : prev);
        successFeedback();
      } else {
        setPickError(data.error);
        errorFeedback();
        setTimeout(() => setPickError(''), 3000);
      }
    } catch {
      setPickError('Error de conexión');
      errorFeedback();
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, orderId, successFeedback, errorFeedback]);

  // Barcode scan
  async function handleBarcodeScan(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim() || actionLoading) return;
    setActionLoading('barcode');
    setPickError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcodeInput.trim(), method: 'barcode' }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(prev => prev ? { ...prev, ...data.session } : prev);
        setBarcodeInput('');
        successFeedback();
        // Highlight the scanned item and show name
        if (data.pickedItem?.lineItemId) {
          setLastScannedItemId(data.pickedItem.lineItemId);
          const scannedOrderItem = orderItems.find(oi => oi.id === data.pickedItem.lineItemId);
          if (scannedOrderItem) {
            const name = getItemName(scannedOrderItem);
            const size = scannedOrderItem.variant?.metadata?.size;
            const color = scannedOrderItem.variant?.metadata?.color;
            const detail = [size, color].filter(Boolean).join(' - ');
            setLastScannedName(`${name}${detail ? ` (${detail})` : ''} — ${data.pickedItem.quantityPicked}/${data.pickedItem.quantityRequired}`);
          }
          setTimeout(() => { setLastScannedItemId(null); setLastScannedName(null); }, 2500);
        }
      } else {
        setBarcodeInput('');
        setShowWrongArticlePopup(true);
        errorFeedback();
        setTimeout(() => {
          setShowWrongArticlePopup(false);
          barcodeRef.current?.focus();
        }, 2000);
      }
    } catch {
      setPickError('Error de conexión');
      errorFeedback();
    } finally {
      setActionLoading(null);
      barcodeRef.current?.focus();
    }
  }

  // Complete picking
  async function handleComplete() {
    if (completing || !session?.isComplete) return;
    setCompleting(true);
    setPickError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();

      if (data.success) {
        completeFeedback();
        setCompletionResult({
          durationFormatted: data.durationFormatted,
          userName: data.userName,
          fulfillmentCreated: data.fulfillmentCreated,
          fulfillmentError: data.fulfillmentError,
          totalMissing: data.totalMissing,
          missingItems: data.missingItems,
        });
        setStep('completed');
      } else {
        setPickError(data.error);
        errorFeedback();
      }
    } catch {
      setPickError('Error al completar');
    } finally {
      setCompleting(false);
    }
  }

  // Cancel session - abre modal para pedir razón
  function handleCancelClick() {
    setCancelReason('');
    setCancelError('');
    setShowCancelModal(true);
  }

  async function handleCancelConfirm() {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelError('Escribí una razón (mínimo 3 caracteres)');
      return;
    }

    setCancelling(true);
    setCancelError('');

    try {
      const res = await fetch(`/api/picking/session/${orderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();

      if (data.success) {
        setShowCancelModal(false);
        setSession(null);
        setStep('idle');
        setPickerPin('');
        setUserId('');
        setElapsed(0);
      } else {
        setCancelError(data.error || 'Error al cancelar');
      }
    } catch {
      setCancelError('Error de conexión');
    } finally {
      setCancelling(false);
    }
  }

  // Marcar como empaquetado / listo para enviar
  async function handlePack() {
    if (packing || packed) return;
    setPacking(true);
    try {
      const res = await fetch(`/api/picking/session/${orderId}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success) {
        setPacked(true);
        successFeedback();
      }
    } catch {
      // Silenciar
    } finally {
      setPacking(false);
    }
  }

  // Don't show picking for already fulfilled orders
  if (fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'shipped' || fulfillmentStatus === 'partially_shipped' || fulfillmentStatus === 'delivered') {
    return null;
  }

  // Loading while checking for existing session
  if (checkingSession) {
    return (
      <div className="print:hidden mt-4">
        <div className="w-full bg-gray-100 py-4 rounded-xl flex items-center justify-center animate-pulse">
          <span className="text-gray-400 text-sm">Cargando...</span>
        </div>
      </div>
    );
  }

  // === IDLE: Botón para empezar picking ===
  if (step === 'idle') {
    return (
      <div className="print:hidden mt-4">
        <button
          onClick={() => setStep('auth')}
          className="w-full bg-blue-600 text-white py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Iniciar Picking
        </button>
      </div>
    );
  }

  // === AUTH: Pedir PIN del picker ===
  if (step === 'auth') {
    return (
      <div className="print:hidden mt-4">
        <div className="bg-white rounded-xl shadow-lg border p-5">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Ingresá tu PIN</h2>
            <p className="text-sm text-gray-500">Para empezar a armar el pedido #{orderDisplayId}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="password"
              value={pickerPin}
              onChange={(e) => setPickerPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{authError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={authLoading || pickerPin.length < 4}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {authLoading ? 'Verificando...' : 'Empezar'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('idle'); setPickerPin(''); setAuthError(''); }}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // === PIN CHANGE: Cambio obligatorio a 6 dígitos ===
  if (step === 'pinChange') {
    return (
      <div className="print:hidden mt-4">
        <div className="bg-white rounded-xl shadow-lg border p-5">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Hola {userName}!</h2>
            <p className="text-sm text-gray-500 mt-1">
              Por seguridad, necesitás cambiar tu PIN a <strong>6 dígitos</strong>
            </p>
          </div>

          <form onSubmit={handlePinChange} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Nuevo PIN (6 dígitos)</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                maxLength={6}
                inputMode="numeric"
                autoFocus
                className="w-full mt-1 px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Repetir nuevo PIN</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                maxLength={6}
                inputMode="numeric"
                className="w-full mt-1 px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            {pinChangeError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{pinChangeError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pinChangeLoading || newPin.length !== 6 || confirmPin.length !== 6}
              className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-amber-700 transition-colors"
            >
              {pinChangeLoading ? 'Guardando...' : 'Cambiar PIN y continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // === COMPLETED: Resumen final + botón listo para enviar ===
  if (step === 'completed' && completionResult) {
    return (
      <div className="print:hidden mt-4 space-y-3">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-800 mb-1">Picking Completado</h2>
          <p className="text-sm text-green-600 mb-4">Pedido #{orderDisplayId}</p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{completionResult.durationFormatted}</p>
              <p className="text-xs text-gray-500">Tiempo</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{completionResult.userName}</p>
              <p className="text-xs text-gray-500">Preparó</p>
            </div>
          </div>

          {completionResult.fulfillmentCreated ? (
            <p className="text-sm text-green-700 font-medium">
              Pedido marcado como preparado en el sistema
            </p>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              <p className="text-sm text-yellow-800">
                Picking registrado, pero hubo un error al actualizar Medusa
              </p>
              {completionResult.fulfillmentError && (
                <p className="text-xs text-yellow-600 mt-1">{completionResult.fulfillmentError}</p>
              )}
            </div>
          )}

          {/* Missing items summary */}
          {completionResult.totalMissing && completionResult.totalMissing > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-left">
              <p className="text-sm font-bold text-red-800 mb-1">
                Productos faltantes: {completionResult.totalMissing}
              </p>
              {completionResult.missingItems?.map((mi) => {
                const oi = orderItems.find(o => o.id === mi.lineItemId);
                return (
                  <p key={mi.lineItemId} className="text-xs text-red-700">
                    - {oi ? getItemName(oi) : mi.sku || mi.barcode || mi.lineItemId} ({mi.quantityMissing} faltantes)
                  </p>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Botón Listo para Enviar */}
        {packed || completionResult.packed ? (
          <div className="space-y-3">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="text-indigo-800 font-bold text-lg">Listo para enviar</span>
              </div>
            </div>
            <button
              onClick={() => {
                const backUrl = new URLSearchParams(window.location.search).get('from');
                if (backUrl === 'gestion') {
                  window.location.href = '/gestion';
                } else {
                  window.location.href = backUrl ? `/?estado=${backUrl}` : '/';
                }
              }}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a pedidos
            </button>
          </div>
        ) : (
          <button
            onClick={handlePack}
            disabled={packing}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg disabled:opacity-50"
          >
            {packing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Marcando...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Listo para Enviar
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // === PICKING: Interface principal ===
  return (
    <div className="print:hidden mt-4 space-y-3">
      {/* Header con timer y progreso */}
      <div className="bg-blue-600 text-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-blue-200 uppercase tracking-wider font-semibold">Armando pedido</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-base font-bold">{userName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold">{formatElapsed(elapsed)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white/20 rounded-full h-3 overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-300"
            style={{ width: `${session?.progressPercent || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-blue-100">
            {session?.totalPicked || 0} / {session?.totalRequired || 0} items
            {(session?.totalMissing || 0) > 0 && (
              <span className="text-red-200 ml-1">({session?.totalMissing} faltantes)</span>
            )}
          </span>
          <span className="text-xs text-blue-100">{session?.progressPercent || 0}%</span>
        </div>
      </div>

      {/* Barcode Scanner - Prominente */}
      <div className="bg-gray-900 rounded-xl p-4">
        <form onSubmit={handleBarcodeScan} className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <input
              ref={barcodeRef}
              type="text"
              inputMode="none"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Escanear código de barras..."
              autoFocus
              className="w-full pl-10 pr-3 py-3.5 bg-white border-2 border-gray-300 rounded-xl text-base font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={!barcodeInput.trim() || !!actionLoading}
            className="px-5 py-3.5 bg-blue-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 active:bg-blue-600"
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
        {actionLoading === 'barcode' && (
          <div className="mt-2 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Procesando...
          </div>
        )}
      </div>

      {/* Error */}
      {pickError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-red-700 text-sm">{pickError}</span>
        </div>
      )}

      {/* Items list - Solo progreso, sin botones */}
      <div className="space-y-1.5">
        {session?.items.map((sessionItem) => {
          const orderItem = orderItems.find(oi => oi.id === sessionItem.lineItemId);
          if (!orderItem) return null;

          const isMissing = (sessionItem.quantityMissing || 0) > 0;
          const isDone = sessionItem.quantityPicked + (sessionItem.quantityMissing || 0) >= sessionItem.quantityRequired;
          const isJustScanned = lastScannedItemId === sessionItem.lineItemId;
          const itemName = getItemName(orderItem);
          const itemCode = getItemCode(orderItem);
          const color = orderItem.variant?.metadata?.color;
          const size = orderItem.variant?.metadata?.size;
          const thumbnail = orderItem.variant?.product?.thumbnail;
          const remaining = sessionItem.quantityRequired - sessionItem.quantityPicked;

          return (
            <div
              key={sessionItem.lineItemId}
              className={`rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                isJustScanned
                  ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300'
                  : isMissing && isDone
                    ? 'border-red-300 bg-red-50'
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
                    isMissing && isDone ? 'text-red-700' : isDone ? 'text-green-700' : 'text-gray-900'
                  }`}>
                    {itemName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500 font-mono">{itemCode}</span>
                    {size && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{size}</span>}
                    {color && <span className="text-xs px-1 py-0.5 bg-gray-100 text-gray-700 rounded">{color}</span>}
                    {isMissing && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-bold">
                        {sessionItem.quantityMissing} faltante{(sessionItem.quantityMissing || 0) > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Counter + Faltante */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Manual buttons */}
                  {manualMode && (
                    <button
                      onClick={() => handleUnpick(sessionItem.lineItemId)}
                      disabled={sessionItem.quantityPicked <= 0 || !!actionLoading}
                      className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center text-sm font-bold disabled:opacity-30 active:bg-red-200"
                    >
                      -
                    </button>
                  )}

                  <div className={`px-2.5 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    isMissing && isDone ? 'bg-red-500 text-white' : isDone ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-900'
                  }`}>
                    {isDone && !isMissing ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      `${sessionItem.quantityPicked}/${sessionItem.quantityRequired}`
                    )}
                  </div>

                  {manualMode && (
                    <button
                      onClick={() => handlePick(sessionItem.lineItemId)}
                      disabled={sessionItem.quantityPicked >= sessionItem.quantityRequired || !!actionLoading}
                      className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold disabled:opacity-30 active:bg-blue-200"
                    >
                      +
                    </button>
                  )}

                  {/* Faltante button */}
                  {!isDone && remaining > 0 && (
                    <button
                      onClick={() => handleMissing(sessionItem.lineItemId, remaining)}
                      disabled={!!actionLoading}
                      className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center disabled:opacity-30 active:bg-red-200"
                      title="Marcar como faltante"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  )}

                  {/* Undo faltante */}
                  {isMissing && (
                    <button
                      onClick={() => handleMissing(sessionItem.lineItemId, 0)}
                      disabled={!!actionLoading}
                      className="w-8 h-8 bg-yellow-100 text-yellow-700 rounded-lg flex items-center justify-center disabled:opacity-30 active:bg-yellow-200"
                      title="Deshacer faltante"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="space-y-2 pb-4">
        {/* Complete button */}
        <button
          onClick={handleComplete}
          disabled={!session?.isComplete || completing}
          className={`w-full py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-all ${
            session?.isComplete
              ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {completing ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Completando...
            </>
          ) : session?.isComplete ? (
            <>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Completar Picking
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Escaneá los productos
            </>
          )}
        </button>

        {/* Modo manual toggle + Cancel */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setManualMode(m => !m); }}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium"
          >
            {manualMode ? 'Ocultar modo manual' : 'Modo manual'}
          </button>
          <button
            onClick={handleCancelClick}
            className="text-xs text-red-400 hover:text-red-600 font-medium"
          >
            Cancelar picking
          </button>
        </div>
      </div>

      {/* Wrong Article Popup */}
      {showWrongArticlePopup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Artículo incorrecto</h3>
            <p className="text-gray-500 text-sm mb-4">El código escaneado no corresponde a ningún artículo de este pedido.</p>
            <button
              onClick={() => { setShowWrongArticlePopup(false); barcodeRef.current?.focus(); }}
              className="w-full py-3 bg-red-500 text-white rounded-xl font-bold text-sm active:bg-red-600"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de cancelación con razón obligatoria */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Cancelar Picking</h3>
                  <p className="text-sm text-gray-500">Pedido #{orderDisplayId}</p>
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-3">
                Escribí el motivo de la cancelación:
              </p>

              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej: Producto sin stock, error en el pedido..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 border-2 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              />

              {cancelError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
                  <span className="text-red-700 text-xs">{cancelError}</span>
                </div>
              )}
            </div>

            <div className="flex border-t">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="flex-1 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r"
              >
                Volver
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={cancelling || cancelReason.trim().length < 3}
                className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {cancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
