'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import LogoutButton from './LogoutButton';

const POLL_INTERVAL = 30000; // 30 segundos

export default function RefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [hasNewOrders, setHasNewOrders] = useState(false);
  const prevCount = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtx.current) {
        audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 587; // Re
      gain.gain.value = 0.25;
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);

      // Segundo tono
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 880; // La
        gain2.gain.value = 0.25;
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);
      }, 200);

      // Vibrar
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch {
      // Audio no disponible
    }
  }, []);

  const checkNewOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/picking/orders-count');
      const data = await res.json();
      if (data.success) {
        const currentCount = data.count;
        // Si es la primera vez, solo guardamos el valor
        if (prevCount.current === null) {
          prevCount.current = currentCount;
          setNewOrderCount(currentCount);
          return;
        }
        // Si hay más pedidos que antes, es un pedido nuevo
        if (currentCount > prevCount.current) {
          setHasNewOrders(true);
          playNotificationSound();
        }
        prevCount.current = currentCount;
        setNewOrderCount(currentCount);
      }
    } catch {
      // Silenciar
    }
  }, [playNotificationSound]);

  useEffect(() => {
    checkNewOrders();
    const interval = setInterval(checkNewOrders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkNewOrders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setHasNewOrders(false);
    router.refresh();
    await checkNewOrders();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="flex items-center gap-1">
      {/* Cerrar sesión */}
      <LogoutButton />

      {/* Link a historial */}
      <Link
        href="/admin/historial"
        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
        aria-label="Historial de picking"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Link>

      {/* Link a admin de usuarios */}
      <Link
        href="/admin/usuarios"
        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
        aria-label="Administrar usuarios"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </Link>

      {/* Botón de refresh con badge */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className={`relative p-2 rounded-lg transition-colors disabled:opacity-50 ${
          hasNewOrders
            ? 'text-orange-600 bg-orange-50 hover:bg-orange-100 animate-pulse'
            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
        }`}
        aria-label="Actualizar"
      >
        <svg
          className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>

        {/* Badge de nuevo pedido */}
        {hasNewOrders && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
            !
          </span>
        )}
      </button>
    </div>
  );
}
