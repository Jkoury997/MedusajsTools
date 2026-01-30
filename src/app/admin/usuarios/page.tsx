'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PickingUser {
  _id: string;
  name: string;
  active: boolean;
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
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [users, setUsers] = useState<PickingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<PickingUser | null>(null);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});

  // Form
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated]);

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    if (!adminPin || adminPin.length !== 4) {
      setAuthError('Ingresá un PIN de 4 dígitos');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await fetch('/api/picking/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin }),
      });
      const data = await res.json();

      if (data.success) {
        setIsAuthenticated(true);
      } else {
        setAuthError('PIN incorrecto');
        setAdminPin('');
      }
    } catch {
      setAuthError('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/picking/users?all=true');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        // Cargar stats de cada usuario
        for (const user of data.users) {
          fetchUserStats(user._id);
        }
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserStats(userId: string) {
    try {
      const res = await fetch(`/api/picking/users/${userId}`);
      const data = await res.json();
      if (data.success) {
        setUserStats(prev => ({
          ...prev,
          [userId]: data.stats,
        }));
      }
    } catch (err) {
      // Silenciar errores de stats
    }
  }

  function openCreate() {
    setEditingUser(null);
    setName('');
    setPin('');
    setActive(true);
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEdit(user: PickingUser) {
    setEditingUser(user);
    setName(user.name);
    setPin('');
    setActive(user.active);
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

    if (!editingUser && (!pin || !/^\d{4}$/.test(pin))) {
      setError('El PIN debe ser de 4 dígitos');
      return;
    }

    if (editingUser && pin && !/^\d{4}$/.test(pin)) {
      setError('El PIN debe ser de 4 dígitos');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Editar
        const body: Record<string, unknown> = { name: name.trim(), active };
        if (pin) body.pin = pin;

        const res = await fetch(`/api/picking/users/${editingUser._id}`, {
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
        const res = await fetch('/api/picking/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), pin }),
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
    if (!confirm(`¿Seguro que querés eliminar a "${userName}"? Esta acción no se puede deshacer.`)) {
      return;
    }

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

  // PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center -mt-16">
        <div className="bg-white rounded-2xl shadow-lg border p-6 w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Admin Picking</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresá el PIN de administrador</p>
          </div>

          <form onSubmit={handleAdminAuth} className="space-y-4">
            <input
              type="password"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              maxLength={4}
              inputMode="numeric"
              autoFocus
              className="w-full px-4 py-3 border-2 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />

            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <span className="text-red-700 text-sm">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || adminPin.length !== 4}
              className="w-full bg-purple-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-purple-700"
            >
              {authLoading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>

          <Link
            href="/"
            className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-4"
          >
            Volver al inicio
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
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Usuarios de Picking</h1>
              <p className="text-xs text-gray-500">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo
          </button>
        </div>
      </div>

      <div className="mt-4">
        {/* Mensaje de éxito */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-800 text-sm">{success}</span>
          </div>
        )}

        {/* Formulario */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">
              {editingUser ? `Editar: ${editingUser.name}` : 'Nuevo Usuario'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Juan"
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  PIN (4 dígitos){editingUser && ' - dejar vacío para no cambiar'}
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={editingUser ? '****' : '1234'}
                  maxLength={4}
                  inputMode="numeric"
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest text-center text-xl"
                />
              </div>

              {editingUser && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActive(!active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      active ? 'bg-green-500' : 'bg-gray-300'
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

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                  <span className="text-red-800 text-xs">{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {/* Lista de usuarios */}
        {!loading && users.length === 0 && !showForm && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900">No hay usuarios</h3>
            <p className="text-xs text-gray-500 mt-1">Creá un usuario con PIN para empezar</p>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="space-y-3">
            {users.map(user => {
              const stats = userStats[user._id];
              return (
                <div
                  key={user._id}
                  className={`bg-white rounded-xl shadow-sm border overflow-hidden ${!user.active ? 'opacity-60' : ''}`}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                          user.active ? 'bg-blue-500' : 'bg-gray-400'
                        }`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            user.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {user.active ? 'Activo' : 'Inactivo'}
                          </span>
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
                          onClick={() => handleDelete(user._id, user.name)}
                          disabled={deleting === user._id}
                          className="text-gray-400 hover:text-red-600 p-2 disabled:opacity-50"
                        >
                          {deleting === user._id ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    {stats && (
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{stats.completedSessions}</p>
                          <p className="text-xs text-gray-500">Pedidos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{stats.totalItemsPicked}</p>
                          <p className="text-xs text-gray-500">Items</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-blue-600">{formatDuration(stats.avgDurationSeconds)}</p>
                          <p className="text-xs text-gray-500">Promedio</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
