'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Badge, Button, Alert, Spinner, Input, ConfirmDialog } from '@/components/ui';
import { formatDate } from '@/lib/format';

interface ApiKeyInfo {
  id: string;
  name: string;
  key: string; // enmascarada excepto al crear
  active: boolean;
  lastUsedAt?: string;
  createdByName: string;
  createdAt: string;
}

export default function AdminSeguridadPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKeyFull, setNewKeyFull] = useState(''); // key completa recién creada
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-keys');
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.apiKeys);
      }
    } catch {
      setError('Error al cargar API keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchKeys(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKeyFull(data.apiKey.key);
        setNewKeyName('');
        setShowForm(false);
        fetchKeys();
      } else {
        setError(data.error || 'Error al crear');
      }
    } catch {
      setError('Error de conexion');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    setConfirmRevoke(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Key "${name}" revocada`);
        fetchKeys();
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch {
      setError('Error al revocar');
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const envConfig = [
    { name: 'ADMIN_PIN', desc: 'PIN de administrador (obligatorio)', example: '(elegí 6 dígitos)' },
    { name: 'SESSION_SECRET', desc: 'Secreto para firmar tokens de sesión', example: 'mi-secreto-seguro-2024-xyz' },
    { name: 'STATS_API_KEY', desc: 'API key para endpoints de estadísticas', example: 'mk_xxxxx (usar key generada abajo)' },
    { name: 'STATS_CORS_ORIGIN', desc: 'Origen permitido para CORS en stats', example: 'https://mi-dashboard.com' },
    { name: 'DATABASE_URL', desc: 'Conexión a PostgreSQL', example: 'postgresql://user:pass@host:5432/db' },
    { name: 'MEDUSA_BACKEND_URL', desc: 'URL del backend de Medusa', example: 'https://backend.tu-dominio.com' },
    { name: 'MEDUSA_SECRET_API_KEY', desc: 'Secret API key de Medusa (admin)', example: 'sk_xxxxx' },
  ];

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900 text-white px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="flex items-center gap-3">
          <Link href="/admin/usuarios" className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Seguridad</h1>
            <p className="text-xs text-gray-400">API keys y configuración</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {/* Mensajes */}
        {error && <Alert tone="error">{error}</Alert>}
        {successMsg && <Alert tone="success">{successMsg}</Alert>}

        {/* Key recién creada */}
        {newKeyFull && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="font-bold text-amber-800">Guarda esta API key ahora</span>
            </div>
            <p className="text-xs text-amber-700">No se mostrará completa de nuevo. Copiala y guardala en tu .env como STATS_API_KEY.</p>
            <div className="bg-white rounded-lg border border-amber-200 p-3 font-mono text-sm break-all text-gray-800">
              {newKeyFull}
            </div>
            <div className="flex gap-2">
              <Button fullWidth onClick={() => handleCopy(newKeyFull)}>
                {copied ? '¡Copiada!' : 'Copiar key'}
              </Button>
              <Button fullWidth variant="secondary" onClick={() => handleCopy(`STATS_API_KEY=${newKeyFull}`)}>
                Copiar como .env
              </Button>
            </div>
            <button
              onClick={() => setNewKeyFull('')}
              className="w-full text-amber-600 text-xs font-medium hover:text-amber-800"
            >
              Ya la guardé, cerrar
            </button>
          </div>
        )}

        {/* Sección API Keys */}
        <Card padding={false} className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">API Keys</h2>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              + Nueva key
            </Button>
          </div>

          {/* Form nueva key */}
          {showForm && (
            <form onSubmit={handleCreate} className="px-4 py-3 bg-brand-50 border-b border-gray-100 flex gap-2 items-end">
              <Input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Nombre (ej: Dashboard)"
                autoFocus
              />
              <Button type="submit" loading={creating} disabled={creating || !newKeyName.trim()}>
                {creating ? '…' : 'Crear'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setNewKeyName(''); }}>
                ×
              </Button>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-8 text-brand-500">
              <Spinner className="w-7 h-7" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="p-4">
              <Alert tone="info">No hay API keys creadas. Creá una para conectar tu dashboard externo.</Alert>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {apiKeys.map(k => (
                <div key={k.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{k.name}</span>
                      <Badge tone={k.active ? 'success' : 'danger'}>
                        {k.active ? 'Activa' : 'Revocada'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{k.key}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Creada {formatDate(k.createdAt)}
                      {k.lastUsedAt && ` - Último uso: ${formatDate(k.lastUsedAt)}`}
                    </p>
                  </div>
                  {k.active && (
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800" onClick={() => setConfirmRevoke({ id: k.id, name: k.name })}>
                      Revocar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Guía de uso */}
        <Card padding={false} className="overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Cómo usar la API key</h2>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">1. Generar key</p>
              <p className="text-xs text-gray-500">Creá una nueva key arriba y copiala</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">2. Configurar en .env</p>
              <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                STATS_API_KEY=mk_tu_key_aqui
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">3. Usar en tu dashboard</p>
              <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                {`fetch('/api/stats/picking', {\n  headers: {\n    'x-publishable-api-key': 'mk_tu_key'\n  }\n})`}
              </div>
            </div>
          </div>
        </Card>

        {/* Configuración de entorno */}
        <Card padding={false} className="overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Variables de entorno</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Configurar en .env o en el panel de tu hosting</p>
          </div>
          <div className="divide-y divide-gray-100">
            {envConfig.map(v => (
              <div key={v.name} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone="brand" className="font-mono">{v.name}</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-1">{v.desc}</p>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Ejemplo: {v.example}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Checklist de seguridad */}
        <Card padding={false} className="overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Checklist de seguridad</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              { text: 'ADMIN_PIN configurado (no usar default)', env: 'ADMIN_PIN' },
              { text: 'SESSION_SECRET configurado con valor único', env: 'SESSION_SECRET' },
              { text: 'STATS_API_KEY configurado para dashboard externo', env: 'STATS_API_KEY' },
              { text: 'STATS_CORS_ORIGIN restringido al dominio de tu dashboard', env: 'STATS_CORS_ORIGIN' },
              { text: 'Todos los pickers con PIN de 6 dígitos', env: null },
              { text: 'HTTPS habilitado en producción', env: null },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-gray-400 mt-0.5">&#9744;</span>
                <span className="text-gray-700">{item.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Confirmación de revocación (reemplaza confirm() nativo) */}
      <ConfirmDialog
        open={confirmRevoke !== null}
        title="Revocar API key"
        message={
          confirmRevoke
            ? `¿Revocar la API key "${confirmRevoke.name}"? Ya no podrá usarse.`
            : ''
        }
        confirmLabel="Revocar"
        tone="danger"
        onConfirm={() => {
          if (confirmRevoke) handleRevoke(confirmRevoke.id, confirmRevoke.name);
        }}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
