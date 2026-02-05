'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';
  const adminError = searchParams.get('error') === 'admin';

  const [pin, setPin] = useState('');
  const [error, setError] = useState(adminError ? 'Necesitás ser admin para acceder a esa sección' : '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    console.log('Submitting PIN:', pin);

    if (!pin || pin.length < 4) {
      setError('Ingresá tu PIN (4-6 dígitos)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/picking/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (data.success) {
        router.push(from);
        router.refresh();
      } else {
        setError(data.error || 'PIN incorrecto');
        setPin('');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 -mt-16">
      <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#ff75a8' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Picking System</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresá tu PIN para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            maxLength={6}
            inputMode="numeric"
            autoFocus
            className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:border-pink-400"
            style={{ '--tw-ring-color': '#ff75a8' } as React.CSSProperties}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ backgroundColor: '#ff75a8' }}
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>

        <a href="/tienda" className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-4">
          Portal de Tienda →
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs h-80" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
