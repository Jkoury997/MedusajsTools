'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthCard, PinInput, Button, Alert } from '@/components/ui';

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
    <AuthCard
      icon="🔒"
      title="Pickeo"
      subtitle="Ingresá tu PIN"
      footer={
        <a href="/tienda" className="text-sm text-gray-400 hover:text-brand-600 transition-colors">
          Portal de Tienda →
        </a>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PinInput
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••••"
          autoFocus
        />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={pin.length < 4}>
          {loading ? 'Verificando...' : 'Ingresar'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="animate-pulse bg-white rounded-3xl shadow-lg border border-gray-100 p-7 h-80" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
