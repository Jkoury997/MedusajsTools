'use client';

import { useCallback, useEffect, useRef } from 'react';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Feedback de audio + vibración para el escaneo de códigos (antes copy-pasteado
 * en PickingInterface, FaltanteReceiveInterface y gestion/recibir). Tipa el
 * AudioContext y lo cierra al desmontar (evita el leak anterior).
 */
export function useAudioFeedback() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  const beep = useCallback(
    (frequency: number, durationMs: number, type: OscillatorType = 'sine') => {
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = type;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    },
    [getCtx],
  );

  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  }, []);

  /** Éxito: beep agudo corto + vibración suave. */
  const success = useCallback(() => {
    beep(880, 120, 'sine');
    vibrate(50);
  }, [beep, vibrate]);

  /** Error: beep grave + vibración doble. */
  const error = useCallback(() => {
    beep(220, 250, 'square');
    vibrate([80, 50, 80]);
  }, [beep, vibrate]);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return { success, error, beep, vibrate };
}
