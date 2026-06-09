'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, Toast } from '../olas/_shared';
import { formatPrice } from '@/lib/format';

const STORAGE_KEY = 'mk-store-user';

interface StoreUser { id: string; name: string; storeId: string; storeName: string; }
interface OrderItem {
  id: string; quantity: number; title?: string; product_title?: string;
  variant_title?: string; variant_sku?: string; thumbnail?: string;
  variant?: { metadata?: { color?: string; size?: string } } | null;
}
interface StoreOrder {
  id: string; display_id: number; fulfillment_status: string; total: number; created_at: string;
  email?: string; isCash?: boolean; deliveredAt?: string | null;
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  shipping_address?: { first_name?: string; last_name?: string; phone?: string; metadata?: { dni?: string } };
  shipping_methods?: { name?: string; data?: { store?: { id: string; name: string; address: string } } }[];
  items?: OrderItem[];
}

// ---- helpers ----
function custName(o: StoreOrder): string {
  const sa = o.shipping_address;
  if (sa?.first_name) return `${sa.first_name} ${sa.last_name || ''}`.trim();
  if (o.customer?.first_name) return `${o.customer.first_name} ${o.customer.last_name || ''}`.trim();
  return o.email || o.customer?.email || 'Sin nombre';
}
function custPhone(o: StoreOrder): string { return o.shipping_address?.phone || o.customer?.phone || ''; }
function custDniRaw(o: StoreOrder): string { return (o.shipping_address?.metadata?.dni || '').replace(/\D/g, ''); }
function fmtDni(d: string): string { return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''; }
function qtyOf(o: StoreOrder): number { return (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0); }
function storeAddrFrom(orders: StoreOrder[]): string {
  for (const o of orders) { const a = o.shipping_methods?.[0]?.data?.store?.address; if (a) return a; }
  return '';
}
function isDelivered(o: StoreOrder): boolean {
  return ['shipped', 'partially_shipped', 'delivered'].includes(o.fulfillment_status);
}
function itemVariant(it: OrderItem): string {
  const c = it.variant?.metadata?.color; const s = it.variant?.metadata?.size;
  const fromMeta = [c, s].filter(Boolean).join(' · ');
  if (fromMeta) return fromMeta;
  return it.variant_title && it.variant_title !== 'Default' ? it.variant_title : '';
}
function hhmm(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// ---- íconos ----
const P = {
  back: <path d="m15 18-6-6 6-6" />,
  shop: <path d="M3 9 4 4h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18M9 21v-6h6v6" />,
  arrow: <path d="M5 12h14M12 5l7 7-7 7" />,
  check: <path d="M20 6 9 17l-5-5" />,
  phone: <path d="M14 4h-4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM12 18h.01" />,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></>,
  ticket: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></>,
  search: <><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  tag: <path d="M20.4 4.9 16 3l-1.5 1.5a3.5 3.5 0 0 1-5 0L8 3 3.6 4.9a1 1 0 0 0-.5 1.3l1.4 3.3 2-1V20a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8.5l2 1 1.4-3.3a1 1 0 0 0-.5-1.3z" />,
};
function Svg({ d, s = 18, c }: { d: React.ReactNode; s?: number; c?: string }) {
  return <svg className="i" viewBox="0 0 24 24" style={{ width: s, height: s, color: c }}>{d}</svg>;
}

export default function TiendaPage() {
  const router = useRouter();
  const { toast, show } = useToast();

  const [user, setUser] = useState<StoreUser | null>(null);
  const [booted, setBooted] = useState(false);

  // login
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [pinChange, setPinChange] = useState<{ user: StoreUser; current: string } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinErr, setPinErr] = useState('');

  // data + navegación
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [tab, setTab] = useState<'retirar' | 'entregados'>('retirar');
  const [screen, setScreen] = useState<'list' | 'detail' | 'search' | 'done'>('list');
  const [selected, setSelected] = useState<StoreOrder | null>(null);
  const [done, setDone] = useState<{ order: StoreOrder; at: string } | null>(null);

  // entrega
  const [cashGate, setCashGate] = useState<StoreOrder | null>(null);
  const [cashOk, setCashOk] = useState(false);
  const [delivering, setDelivering] = useState(false);

  // buscar
  const [mode, setMode] = useState<'dni' | 'order'>('dni');
  const [query, setQuery] = useState('');

  const fetchOrders = useCallback(async (u: StoreUser) => {
    try {
      const res = await fetch(`/api/picking/store-orders?storeId=${u.storeId}`, { credentials: 'include' });
      if (res.status === 401) { localStorage.removeItem(STORAGE_KEY); setUser(null); return; }
      const data = await res.json();
      if (data.success) setOrders(data.orders);
    } catch { /* red */ }
  }, []);

  // restaurar sesión de tienda (cookie httpOnly + datos no sensibles en localStorage)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const u = JSON.parse(raw) as StoreUser; setUser(u); fetchOrders(u); }
    } catch { /* noop */ }
    setBooted(true);
  }, [fetchOrders]);

  async function submitPin() {
    if (pin.length < 4) { setAuthError('Ingresá el PIN (4 a 6 dígitos)'); return; }
    setAuthLoading(true); setAuthError('');
    try {
      const res = await fetch('/api/picking/store-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        const u = data.user as StoreUser;
        if (data.requirePinChange) { setPinChange({ user: u, current: pin }); }
        else { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); setUser(u); fetchOrders(u); }
        setPin('');
      } else { setAuthError(data.error || 'PIN incorrecto'); setPin(''); }
    } catch { setAuthError('Error de conexión'); }
    finally { setAuthLoading(false); }
  }

  async function submitPinChange() {
    if (!/^\d{6}$/.test(newPin)) { setPinErr('El nuevo PIN debe ser de 6 dígitos'); return; }
    if (newPin !== confirmPin) { setPinErr('Los PINs no coinciden'); return; }
    if (!pinChange) return;
    try {
      const res = await fetch('/api/picking/auth', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pinChange.user.id, currentPin: pinChange.current, newPin }),
      });
      const data = await res.json();
      if (data.success) {
        const u = pinChange.user;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        setUser(u); setPinChange(null); setNewPin(''); setConfirmPin(''); fetchOrders(u);
      } else { setPinErr(data.error || 'Error al cambiar PIN'); }
    } catch { setPinErr('Error de conexión'); }
  }

  function logout() {
    fetch('/api/picking/login', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
    setUser(null); setOrders(null); setScreen('list'); setPin('');
  }

  function openDetail(o: StoreOrder) { setSelected(o); setCashOk(false); setScreen('detail'); }

  async function doDeliver(o: StoreOrder) {
    if (delivering) return;
    setDelivering(true);
    try {
      const res = await fetch('/api/picking/deliver', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id, orderDisplayId: o.display_id }),
      });
      const data = await res.json();
      if (data.success) {
        setCashGate(null);
        setDone({ order: o, at: data.delivery?.deliveredAt || new Date().toISOString() });
        setScreen('done');
        if (user) fetchOrders(user);
      } else { show('err', data.error || 'Error al entregar'); }
    } catch { show('err', 'Error de conexión'); }
    finally { setDelivering(false); }
  }

  function confirmDeliver(o: StoreOrder) {
    if (o.isCash && !cashOk) { setCashGate(o); return; }
    doDeliver(o);
  }

  // ====== RENDER ======
  if (!booted) return <div className="screen"><div className="spin" /></div>;

  // ---- Cambio de PIN ----
  if (pinChange) {
    return (
      <div className="screen">
        <div className="body" style={{ justifyContent: 'center', flex: 1, gap: 18 }}>
          <div className="center">
            <div style={{ fontSize: 19, fontWeight: 800 }}>¡Hola {pinChange.user.name}!</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Por seguridad, cambiá tu PIN a 6 dígitos</div>
          </div>
          <input className="ta" inputMode="numeric" maxLength={6} placeholder="Nuevo PIN (6 dígitos)"
            value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: '.4em', fontWeight: 800 }} />
          <input className="ta" inputMode="numeric" maxLength={6} placeholder="Repetir nuevo PIN"
            value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: '.4em', fontWeight: 800 }} />
          {pinErr && <div className="toast err">{pinErr}</div>}
          <button className="btn btn-primary btn-block btn-lg" onClick={submitPinChange}
            disabled={newPin.length !== 6 || confirmPin.length !== 6}>Cambiar PIN y continuar</button>
        </div>
      </div>
    );
  }

  // ---- Login (keypad) ----
  if (!user) {
    return (
      <div className="screen">
        <div className="body" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: '30px 24px' }}>
          <div style={{ width: 62, height: 62, borderRadius: 18, background: 'var(--pink-100)', color: 'var(--pink-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Svg d={P.shop} s={30} />
          </div>
          <div className="center">
            <div style={{ fontSize: 19, fontWeight: 800 }}>Portal de Tienda</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Ingresá el PIN de tu sucursal</div>
          </div>
          <input
            className="ta"
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => { setAuthError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }}
            placeholder="••••••"
            style={{ maxWidth: 260, textAlign: 'center', fontSize: 26, letterSpacing: '.4em', fontWeight: 800 }}
          />
          {authError && <div className="toast err">{authError}</div>}
          <button className="btn btn-primary btn-block btn-lg" style={{ maxWidth: 260 }} onClick={submitPin} disabled={authLoading || pin.length < 4}>
            {authLoading ? 'Verificando…' : 'Ingresar'}
          </button>
          <button className="btn btn-ghost" onClick={() => router.push('/')}>Volver al inicio</button>
        </div>
      </div>
    );
  }

  const retirar = (orders || []).filter((o) => !isDelivered(o));
  const entregados = (orders || []).filter((o) => isDelivered(o));
  const entregadosHoy = entregados.filter((o) => isToday(o.deliveredAt)).length;
  const storeAddr = orders ? storeAddrFrom(orders) : '';

  // ---- Detalle / entregar ----
  if (screen === 'detail' && selected) {
    const o = selected; const dni = custDniRaw(o); const phone = custPhone(o);
    return (
      <div className="screen">
        <header className="head">
          <button className="back" onClick={() => setScreen(query ? 'search' : 'list')}><Svg d={P.back} s={20} /></button>
          <div><h3>Pedido #{o.display_id}</h3><div className="sub">Retiro en tienda</div></div>
        </header>
        <div className="body">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div className="row gap10">
              <span className="av" style={{ width: 44, height: 44, fontSize: 17 }}>{custName(o).charAt(0).toUpperCase()}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{custName(o)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{dni ? `DNI ${fmtDni(dni)}` : 'Sin DNI'}{phone ? ` · ${phone}` : ''}</div>
              </div>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: '10px 12px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <Svg d={P.user} s={17} c="var(--warn)" />
              <div style={{ fontSize: 12.5, color: '#92400e' }}><b>Verificá el DNI</b> antes de entregar. Debe coincidir con el del comprador.</div>
            </div>
          </div>

          <span className="sect-label" style={{ padding: '0 2px' }}>Productos · {qtyOf(o)} u.</span>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(o.items || []).map((it, idx) => {
              const name = it.product_title || it.title || 'Producto'; const v = itemVariant(it);
              return (
                <div key={it.id || idx}>
                  {idx > 0 && <div className="divide" style={{ margin: '8px 0' }} />}
                  <div className="row gap10">
                    {it.thumbnail
                      ? <img src={it.thumbnail} alt={name} style={{ width: 42, height: 42, borderRadius: 11, objectFit: 'cover', border: '1px solid var(--border)', flex: 'none' }} />
                      : <span className="thumb"><Svg d={P.tag} /></span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      {v && <div className="muted" style={{ fontSize: 11.5 }}>{v}</div>}
                    </div>
                    <span className="qbox">×{it.quantity}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card row between" style={{ padding: '13px 15px' }}>
            <span className="row gap8 muted" style={{ fontWeight: 600, fontSize: 13.5 }}>
              <Svg d={o.isCash ? P.cash : P.ticket} s={17} />{o.isCash ? 'Efectivo (cobrar al retirar)' : 'Pago online'}
            </span>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{formatPrice(o.total)}</span>
          </div>
        </div>
        <div className="pfoot">
          <button className="btn btn-success btn-block btn-lg" onClick={() => confirmDeliver(o)} disabled={delivering}>
            <Svg d={P.check} s={20} /> {delivering ? 'Entregando…' : 'Confirmar entrega'}
          </button>
        </div>

        {/* Sheet de cobro en efectivo */}
        {cashGate && (
          <div className="overlay" onClick={() => !delivering && setCashGate(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--warn-bg)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Svg d={P.cash} s={26} />
              </div>
              <h4>Cobrar en efectivo</h4>
              <p>Este pedido se paga al retirar. Cobrá el total antes de entregar la mercadería.</p>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#92400e' }}>Total a cobrar</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#92400e', marginTop: 2 }}>{formatPrice(cashGate.total)}</div>
              </div>
              <label className="row gap8" style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }} onClick={() => setCashOk((v) => !v)}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: cashOk ? 'var(--ok)' : 'var(--soft)', border: cashOk ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  {cashOk && <Svg d={P.check} s={15} c="#fff" />}
                </span>
                Confirmo que recibí el pago
              </label>
              <div className="row gap8">
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCashGate(null)} disabled={delivering}>Cancelar</button>
                <button className="btn btn-success" style={{ flex: 1.4 }} disabled={!cashOk || delivering} onClick={() => doDeliver(cashGate)}>
                  {delivering ? 'Procesando…' : 'Cobré y entrego'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Entrega confirmada ----
  if (screen === 'done' && done) {
    return (
      <div className="screen">
        <header className="head">
          <button className="back" onClick={() => { setScreen('list'); setSelected(null); }}><Svg d={P.back} s={20} /></button>
          <div><h3>Entrega</h3></div>
        </header>
        <div className="body" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 30, gap: 16 }}>
          <div style={{ width: 78, height: 78, borderRadius: 999, background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(22,163,74,.3)' }}>
            <Svg d={P.check} s={40} c="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#15803d' }}>¡Pedido entregado!</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>#{done.order.display_id} · {custName(done.order)}</div>
          </div>
          <div className="card" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="row between" style={{ fontSize: 13 }}><span className="muted">Retiró</span><span style={{ fontWeight: 700 }}>{custName(done.order)}</span></div>
            {custDniRaw(done.order) && <div className="row between" style={{ fontSize: 13 }}><span className="muted">DNI verificado</span><span style={{ fontWeight: 700, color: 'var(--ok)' }}>{fmtDni(custDniRaw(done.order))} ✓</span></div>}
            <div className="row between" style={{ fontSize: 13 }}><span className="muted">Hora</span><span style={{ fontWeight: 700 }}>{hhmm(done.at)}</span></div>
            {done.order.isCash && <div className="row between" style={{ fontSize: 13 }}><span className="muted">Cobrado</span><span style={{ fontWeight: 700 }}>Efectivo {formatPrice(done.order.total)}</span></div>}
          </div>
        </div>
        <div className="pfoot">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { setScreen('list'); setSelected(null); setQuery(''); }}>Volver a pedidos</button>
        </div>
      </div>
    );
  }

  // ---- Buscar por DNI / N° de pedido ----
  if (screen === 'search') {
    const q = query.replace(/\D/g, '');
    const results = q.length === 0 ? [] : (orders || []).filter((o) =>
      mode === 'dni' ? custDniRaw(o).includes(q) : String(o.display_id).includes(q));
    return (
      <div className="screen">
        <header className="head">
          <button className="back" onClick={() => { setScreen('list'); setQuery(''); }}><Svg d={P.back} s={20} /></button>
          <div><h3>Buscar pedido</h3><div className="sub">{user.storeName}</div></div>
        </header>
        <div className="body">
          <div className="seg-mode">
            <button data-active={mode === 'dni'} onClick={() => { setMode('dni'); setQuery(''); }}>Por DNI</button>
            <button data-active={mode === 'order'} onClick={() => { setMode('order'); setQuery(''); }}>N° de pedido</button>
          </div>
          <div className={`searchbar${q ? '' : ' idle'}`}>
            <Svg d={mode === 'dni' ? P.user : P.tag} c={q ? 'var(--pink)' : 'var(--muted)'} />
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder={mode === 'dni' ? 'Ingresá el DNI…' : 'N° de pedido…'}
            />
            {q && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'var(--soft)', width: 28, height: 28, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', cursor: 'pointer', flex: 'none' }}><Svg d={P.x} s={15} /></button>}
          </div>

          {q && (
            results.length > 0 ? (
              <>
                <div className="row gap8" style={{ padding: '0 2px' }}>
                  <Svg d={P.check} s={16} c="var(--ok)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{results.length} pedido{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}</span>
                </div>
                {results.map((o) => {
                  const delivered = isDelivered(o);
                  return (
                    <div key={o.id} className="card pad0">
                      <div className="lrow between" style={{ background: delivered ? 'var(--ok-bg)' : '#fafafa', borderBottom: '1px solid var(--border)' }}>
                        <div className="row gap8"><span style={{ fontSize: 15, fontWeight: 800 }}>#{o.display_id}</span>
                          {delivered ? <span className="badge b-ok"><Svg d={P.check} s={12} />Entregado</span>
                            : o.isCash ? <span className="badge b-warn">Cobrar efectivo</span>
                              : <span className="badge b-ok">Listo para retirar</span>}
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ok)' }}>{formatPrice(o.total)}</span>
                      </div>
                      <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <div className="row gap10"><span className="av">{custName(o).charAt(0).toUpperCase()}</span>
                          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{custName(o)}</div>
                            <div className="muted" style={{ fontSize: 12 }}>{custDniRaw(o) ? `DNI ${fmtDni(custDniRaw(o))}` : ''}{custPhone(o) ? ` · ${custPhone(o)}` : ''}</div></div>
                        </div>
                        {delivered
                          ? <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 11, padding: '10px 12px', fontSize: 12.5, color: '#166534' }}>Ya entregado{o.deliveredAt ? ` ${isToday(o.deliveredAt) ? 'hoy' : ''} ${hhmm(o.deliveredAt)}` : ''}.</div>
                          : <button className="btn btn-primary btn-block" onClick={() => openDetail(o)}><Svg d={P.arrow} s={18} />Ver y entregar</button>}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="empty">
                <div className="ill" style={{ background: 'var(--soft)', borderColor: 'var(--border)', color: 'var(--muted)' }}><Svg d={P.search} s={38} /></div>
                <h4>Sin resultados</h4>
                <p>No encontramos pedidos en esta sucursal para <b>{mode === 'dni' ? fmtDni(q) : `#${q}`}</b>. Verificá el número o probá el otro modo.</p>
              </div>
            )
          )}

        </div>
        <Toast toast={toast} />
      </div>
    );
  }

  // ---- Home de la sucursal (lista) ----
  const list = tab === 'retirar' ? retirar : entregados;
  return (
    <div className="screen">
      <div className="store-top">
        <div className="row1">
          <div className="row gap10">
            <div className="stchip"><Svg d={P.shop} s={20} c="#fff" /></div>
            <div><h3>{user.storeName}</h3>{storeAddr && <div className="sub2">{storeAddr}</div>}</div>
          </div>
          <button className="salir" onClick={logout}>Salir</button>
        </div>
        <div className="store-stats">
          <div className="s"><div className="n">{retirar.length}</div><div className="l">Para retirar</div></div>
          <div className="s"><div className="n">{entregadosHoy}</div><div className="l">Entregados hoy</div></div>
        </div>
      </div>

      <div className="body">
        <div className="tabs2">
          <button className="tab2" data-active={tab === 'retirar'} onClick={() => setTab('retirar')}>Para retirar<span className="cn">{retirar.length}</span></button>
          <button className="tab2" data-active={tab === 'entregados'} onClick={() => setTab('entregados')}>Entregados<span className="cn">{entregados.length}</span></button>
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => { setMode('dni'); setQuery(''); setScreen('search'); }}>
          <Svg d={P.search} s={18} /> Buscar por DNI o N° de pedido
        </button>

        {!orders && <div className="spin" />}

        {orders && list.length === 0 && (
          <div className="empty">
            <div className="ill"><Svg d={P.shop} s={38} /></div>
            <h4>{tab === 'retirar' ? 'Sin pedidos por retirar' : 'Sin entregas todavía'}</h4>
            <p>{tab === 'retirar' ? 'Cuando lleguen pedidos para tu sucursal, los vas a ver acá.' : 'Los pedidos entregados aparecerán acá.'}</p>
          </div>
        )}

        {list.map((o) => (
          <div key={o.id} className="card pad0">
            <div className="lrow between" style={{ background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
              <div className="row gap8">
                <span style={{ fontSize: 15, fontWeight: 800 }}>#{o.display_id}</span>
                {tab === 'entregados'
                  ? <span className="badge b-ok"><Svg d={P.check} s={12} />Entregado{o.deliveredAt && isToday(o.deliveredAt) ? ` · ${hhmm(o.deliveredAt)}` : ''}</span>
                  : o.isCash ? <span className="badge b-warn">Cobrar efectivo</span> : null}
              </div>
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ok)' }}>{formatPrice(o.total)}</span>
            </div>
            <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="row gap10">
                <span className="av">{custName(o).charAt(0).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{custName(o)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{custDniRaw(o) ? `DNI ${fmtDni(custDniRaw(o))}` : 'Sin DNI'}</div>
                  {custPhone(o) && <div className="row gap6" style={{ color: 'var(--pink-fg)', fontSize: 12, marginTop: 2 }}><Svg d={P.phone} s={12} />{custPhone(o)}</div>}
                </div>
              </div>
              {tab === 'retirar' && (
                <button className="btn btn-primary btn-block" onClick={() => openDetail(o)}>
                  <Svg d={P.arrow} s={18} /> Ver y entregar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
