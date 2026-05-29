'use client';

import { useState, useEffect, useCallback } from 'react';
import { PinInput, Button, Badge, Card, Alert, Spinner, Input, ConfirmDialog } from '@/components/ui';
import { AdminNav } from '@/components/AdminNav';

interface PickingUser {
  id: string;
  name: string;
  active: boolean;
  role?: 'picker' | 'store';
  storeId?: string;
  storeName?: string;
  /** PIN en claro (solo lo devuelve la API a un admin). null = aún no visible. */
  pin?: string | null;
  createdAt: string;
}

interface UserStats {
  totalSessions: number;
  completedSessions: number;
  totalItemsPicked: number;
  avgDurationSeconds: number;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<PickingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<PickingUser | null>(null);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});

  // Form
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(true);
  const [role, setRole] = useState<'picker' | 'store'>('picker');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [availableStores, setAvailableStores] = useState<{ id: string; name: string; address: string }[]>([]);
  const [showNewStore, setShowNewStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [savingStore, setSavingStore] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set());

  function togglePin(id: string) {
    setRevealedPins(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch('/api/picking/stores');
      const data = await res.json();
      if (data.success) setAvailableStores(data.stores);
    } catch { /* silent */ }
  }, []);

  async function handleCreateStore() {
    if (!newStoreName.trim()) {
      setError('El nombre de la tienda es requerido');
      return;
    }
    setSavingStore(true);
    setError('');
    try {
      const res = await fetch('/api/picking/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStoreName.trim(), address: newStoreAddress.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        // Seleccionar la tienda recién creada
        setStoreId(data.store.id);
        setStoreName(data.store.name);
        setNewStoreName('');
        setNewStoreAddress('');
        setShowNewStore(false);
        // Refrescar lista
        await fetchStores();
        setSuccess('Tienda creada correctamente');
      } else {
        setError(data.error || 'Error al crear tienda');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSavingStore(false);
    }
  }

  const fetchUserStats = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/picking/users/${userId}`);
      const data = await res.json();
      if (data.success) {
        setUserStats(prev => ({
          ...prev,
          [userId]: data.stats,
        }));
      }
    } catch {
      // Silenciar errores de stats
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/picking/users?all=true');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        // Cargar stats de cada usuario
        for (const user of data.users) {
          fetchUserStats(user.id);
        }
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchUserStats]);

  useEffect(() => {
    fetchUsers();
    fetchStores();
  }, [fetchUsers, fetchStores]);

  function openCreate() {
    setEditingUser(null);
    setName('');
    setPin('');
    setActive(true);
    setRole('picker');
    setStoreId('');
    setStoreName('');
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEdit(user: PickingUser) {
    setEditingUser(user);
    setName(user.name);
    setPin('');
    setActive(user.active);
    setRole(user.role || 'picker');
    setStoreId(user.storeId || '');
    setStoreName(user.storeName || '');
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (!editingUser && (!pin || !/^\d{4,6}$/.test(pin))) {
      setError('El PIN debe ser de 4 a 6 dígitos');
      return;
    }

    if (editingUser && pin && !/^\d{4,6}$/.test(pin)) {
      setError('El PIN debe ser de 4 a 6 dígitos');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Editar
        const body: Record<string, unknown> = { name: name.trim(), active, role };
        if (pin) body.pin = pin;
        if (role === 'store') {
          body.storeId = storeId;
          body.storeName = storeName;
        }

        const res = await fetch(`/api/picking/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.success) {
          setSuccess('Usuario actualizado');
          setShowForm(false);
          fetchUsers();
        } else {
          setError(data.error);
        }
      } else {
        // Crear
        const body: Record<string, unknown> = { name: name.trim(), pin, role };
        if (role === 'store') {
          body.storeId = storeId;
          body.storeName = storeName;
        }

        const res = await fetch('/api/picking/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.success) {
          setSuccess('Usuario creado');
          setShowForm(false);
          fetchUsers();
        } else {
          setError(data.error);
        }
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userId: string, userName: string) {
    setConfirmDelete(null);
    setDeleting(userId);
    try {
      const res = await fetch(`/api/picking/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Usuario "${userName}" eliminado`);
        fetchUsers();
      } else {
        setError(data.error || 'Error al eliminar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen">
      <AdminNav />

      {/* Header */}
      <div className="px-4 py-3 -mx-4 sm:-mx-6 lg:-mx-8 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Usuarios de Picking</h1>
            <p className="text-xs text-gray-500">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {/* Mensaje de éxito */}
        {success && (
          <div className="mb-4">
            <Alert tone="success">{success}</Alert>
          </div>
        )}

        {/* Formulario */}
        {showForm && (
          <Card className="mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">
              {editingUser ? `Editar: ${editingUser.name}` : 'Nuevo Usuario'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                label="Nombre"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Juan"
                autoFocus
              />

              {/* Tipo de usuario */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    fullWidth
                    variant={role === 'picker' ? 'primary' : 'secondary'}
                    onClick={() => setRole('picker')}
                  >
                    Picker
                  </Button>
                  <Button
                    type="button"
                    fullWidth
                    variant={role === 'store' ? 'success' : 'secondary'}
                    onClick={() => setRole('store')}
                  >
                    Tienda
                  </Button>
                </div>
              </div>

              {/* Campos de tienda */}
              {role === 'store' && (
                <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">Tienda asignada</label>
                    <button
                      type="button"
                      onClick={() => setShowNewStore(!showNewStore)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                    >
                      {showNewStore ? (
                        <>✕ Cancelar</>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Nueva tienda
                        </>
                      )}
                    </button>
                  </div>

                  {showNewStore ? (
                    <div className="space-y-2 bg-white rounded-lg p-3 border border-emerald-200">
                      <p className="text-xs text-gray-500 font-medium">Crear nueva tienda</p>
                      <Input
                        type="text"
                        value={newStoreName}
                        onChange={(e) => setNewStoreName(e.target.value)}
                        placeholder="Nombre de la tienda"
                      />
                      <Input
                        type="text"
                        value={newStoreAddress}
                        onChange={(e) => setNewStoreAddress(e.target.value)}
                        placeholder="Dirección (opcional)"
                      />
                      <Button
                        type="button"
                        size="sm"
                        fullWidth
                        variant="success"
                        loading={savingStore}
                        onClick={handleCreateStore}
                        disabled={savingStore || !newStoreName.trim()}
                      >
                        {savingStore ? 'Creando…' : 'Crear y seleccionar'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <select
                        value={storeId}
                        onChange={(e) => {
                          const selected = availableStores.find(s => s.id === e.target.value);
                          setStoreId(e.target.value);
                          setStoreName(selected?.name || '');
                        }}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                      >
                        <option value="">Seleccionar tienda...</option>
                        {availableStores.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.address ? ` — ${s.address}` : ''}
                          </option>
                        ))}
                      </select>
                      {availableStores.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-1">No hay tiendas. Creá una con el botón &quot;Nueva tienda&quot;.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  PIN (4 a 6 dígitos){editingUser && ' - dejar vacío para no cambiar'}
                </label>
                <PinInput
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={editingUser ? '••••' : '1234'}
                />
              </div>

              {editingUser && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActive(!active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      active ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">{active ? 'Activo' : 'Inactivo'}</span>
                </div>
              )}

              {error && <Alert tone="error">{error}</Alert>}

              <div className="flex gap-2">
                <Button type="submit" fullWidth loading={saving} disabled={saving}>
                  {saving ? 'Guardando…' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12 text-brand-500">
            <Spinner className="w-8 h-8" />
          </div>
        )}

        {/* Lista de usuarios */}
        {!loading && users.length === 0 && !showForm && (
          <Alert tone="info">No hay usuarios. Creá uno con PIN para empezar.</Alert>
        )}

        {!loading && users.length > 0 && (
          <div className="space-y-3">
            {users.map(user => {
              const stats = userStats[user.id];
              return (
                <Card key={user.id} className={!user.active ? 'opacity-60' : ''}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                          !user.active ? 'bg-gray-400' : user.role === 'store' ? 'bg-emerald-500' : 'bg-brand-500'
                        }`}>
                          {user.role === 'store' ? '🏪' : user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge tone={user.active ? 'success' : 'gray'}>
                              {user.active ? 'Activo' : 'Inactivo'}
                            </Badge>
                            <Badge tone={user.role === 'store' ? 'success' : 'info'}>
                              {user.role === 'store' ? `Tienda: ${user.storeName || '?'}` : 'Picker'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="text-gray-400 hover:text-gray-600 p-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ id: user.id, name: user.name })}
                          disabled={deleting === user.id}
                          className="text-gray-400 hover:text-red-600 p-2 disabled:opacity-50"
                        >
                          {deleting === user.id ? (
                            <Spinner className="w-5 h-5" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* PIN (visible solo para admin) */}
                    <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2 mb-2">
                      <span className="text-gray-500 font-medium">PIN:</span>
                      {user.pin ? (
                        <>
                          <span className="font-mono tracking-widest text-gray-900">
                            {revealedPins.has(user.id) ? user.pin : '•'.repeat(user.pin.length)}
                          </span>
                          <button
                            onClick={() => togglePin(user.id)}
                            className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                          >
                            {revealedPins.has(user.id) ? 'Ocultar' : 'Ver'}
                          </button>
                          {revealedPins.has(user.id) && (
                            <button
                              onClick={() => navigator.clipboard.writeText(user.pin || '')}
                              className="text-gray-400 hover:text-gray-600 text-xs"
                            >
                              Copiar
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          aún no visible — se revela cuando el usuario hace login o reseteás su PIN
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    {stats && (
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{stats.completedSessions}</p>
                          <p className="text-xs text-gray-500">Pedidos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{stats.totalItemsPicked}</p>
                          <p className="text-xs text-gray-500">Items</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-brand-600">{formatDuration(stats.avgDurationSeconds)}</p>
                          <p className="text-xs text-gray-500">Promedio</p>
                        </div>
                      </div>
                    )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmación de borrado (reemplaza confirm() nativo) */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar usuario"
        message={
          confirmDelete
            ? `¿Seguro que querés eliminar a "${confirmDelete.name}"? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        tone="danger"
        loading={confirmDelete ? deleting === confirmDelete.id : false}
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete.id, confirmDelete.name);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
