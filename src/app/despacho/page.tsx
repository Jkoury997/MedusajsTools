'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, Icon, timeAgo, useToast, Toast } from '../olas/_shared';
import { formatPrice } from '@/lib/format';

type Tab = 'por-enviar' | 'enviados';

interface DespachoSession {
  packed?: boolean;
  userName?: string;
  totalPicked?: number;
  voucherCode?: string;
  voucherValue?: number;
}
interface DespachoOrder {
  id: string;
  displayId: number;
  total: number;
  createdAt: string;
  customerName: string;
  address: string | null;
  shippingMethod: string | null;
  isExpress: boolean;
  isStorePickup: boolean;
  isSentToStore: boolean;
  isMercadoLibre: boolean;
  mlShipmentId: number | null;
  mlTrackingNumber: string | null;
  storeName: string | null;
  sentToStoreAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  dni: string | null;
  fulfillmentStatus: string;
  itemCount: number;
  session: DespachoSession | null;
}

// ---- íconos locales (.i = stroke currentColor) ----
const I: Record<string, React.ReactNode> = {
  truck: <><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1M14 9h4l4 4v4a1 1 0 0 1-1 1h-1M9 18h6M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /></>,
  box: <><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></>,
  ticket: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  shop: <path d="M3 9 4 4h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18" />,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" /></>,
};
function Svg({ name, s = 14 }: { name: string; s?: number }) {
  return <svg className="i" viewBox="0 0 24 24" style={{ width: s, height: s }}>{I[name]}</svg>;
}

function dispatchTs(o: DespachoOrder): string {
  return o.deliveredAt || o.shippedAt || o.sentToStoreAt || o.createdAt;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Badge del carrier (ML / retiro en tienda / método de envío).
function CarrierBadge({ o }: { o: DespachoOrder }) {
  if (o.isMercadoLibre) {
    return <span className="badge" style={{ background: '#fff3cd', color: '#8a6d00' }}><Svg name="bag" s={12} />Mercado Libre</span>;
  }
  if (o.isStorePickup) {
    return <span className="badge b-pink"><Svg name="shop" s={12} />Retiro en tienda</span>;
  }
  if (o.shippingMethod) {
    return <span className="badge b-info"><Svg name="truck" s={12} />{o.shippingMethod}</span>;
  }
  return null;
}

export default function DespachoPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('por-enviar');
  const [orders, setOrders] = useState<DespachoOrder[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const { toast, show } = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'ship' | 'deliver'; order: DespachoOrder } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Deep-link desde el Home (?tab=por-enviar|enviados).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'enviados') setTab('enviados');
  }, []);

  const load = useCallback(async (which: Tab) => {
    setOrders(null);
    try {
      const data = await api<{ orders: DespachoOrder[]; counts: Record<string, number> }>(`/api/gestion?tab=${which}`);
      setOrders(data.orders);
      setCounts(data.counts || {});
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  async function runAction() {
    if (!confirm) return;
    const { kind, order } = confirm;
    setSubmitting(true);
    try {
      await api(`/api/gestion/${kind}`, { method: 'POST', body: { orderId: order.id, orderDisplayId: order.displayId } });
      const verb = kind === 'ship' ? (order.isStorePickup ? 'enviado a tienda' : 'marcado como enviado') : 'marcado como entregado';
      show('ok', `Pedido #${order.displayId} ${verb}`);
      setConfirm(null);
      load(tab);
    } catch (e) {
      show('err', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Agrupa los enviados por día real de despacho.
  const groups: { label: string; items: DespachoOrder[] }[] = [];
  if (tab === 'enviados' && orders) {
    const sorted = [...orders].sort((a, b) => dispatchTs(b).localeCompare(dispatchTs(a)));
    for (const o of sorted) {
      const label = dayLabel(dispatchTs(o));
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(o); else groups.push({ label, items: [o] });
    }
  }

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push('/')}><Icon name="back" /></button>
        <div>
          <h3>Despachos</h3>
          <div className="sub">Mesa de salida</div>
        </div>
      </header>

      <div className="body">
        <div className="tabs2">
          <button className="tab2" data-active={tab === 'por-enviar'} onClick={() => setTab('por-enviar')}>
            <Svg name="box" s={17} />Por enviar
            {counts['por-enviar'] != null && <span className="cn">{counts['por-enviar']}</span>}
          </button>
          <button className="tab2" data-active={tab === 'enviados'} onClick={() => setTab('enviados')}>
            <Svg name="truck" s={17} />Enviados
            {counts.enviados != null && <span className="cn">{counts.enviados}</span>}
          </button>
        </div>

        {error && <div className="toast err">{error}</div>}
        {!orders && !error && <div className="spin" />}

        {orders && orders.length === 0 && (
          <div className="empty">
            <div className="ill"><Svg name={tab === 'por-enviar' ? 'truck' : 'box'} s={38} /></div>
            <h4>{tab === 'por-enviar' ? 'Nada por enviar' : 'Sin envíos'}</h4>
            <p>{tab === 'por-enviar' ? 'Todos los pedidos empacados ya fueron despachados.' : 'Los pedidos despachados aparecerán acá.'}</p>
          </div>
        )}

        {/* ---------- POR ENVIAR ---------- */}
        {tab === 'por-enviar' && (orders || []).map((o) => {
          const voucher = o.session?.voucherCode ? `Voucher${o.session.voucherValue ? ` ${formatPrice(o.session.voucherValue)}` : ''}` : null;
          return (
            <div key={o.id} className="card pad0">
              <div className="lrow between" style={{ paddingBottom: 0 }}>
                <div className="row gap8">
                  <span style={{ fontSize: 16, fontWeight: 800 }}>#{o.displayId}</span>
                  {o.session?.packed && <span className="badge b-ok">Empacado</span>}
                  {o.isExpress && <span className="badge b-warn">Express</span>}
                </div>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--pink-fg)' }}>{formatPrice(o.total)}</span>
              </div>

              <div style={{ padding: '9px 14px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="row between">
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{o.customerName}</span>
                  <CarrierBadge o={o} />
                </div>
                {o.address && (
                  <div className="row gap8 muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    <Svg name="pin" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.address}</span>
                  </div>
                )}
                <div className="row between">
                  <span className="row gap6 muted" style={{ fontSize: 12 }}>
                    <Svg name="user" s={13} />Preparó {o.session?.userName || '—'} · {o.itemCount} u.
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{timeAgo(o.createdAt)}</span>
                </div>
                {voucher && (
                  <span className="row gap6" style={{ fontSize: 11.5, fontWeight: 700, color: '#6d28d9' }}>
                    <Svg name="ticket" /> {voucher}
                  </span>
                )}
                {o.isMercadoLibre && o.mlShipmentId && (
                  <a
                    className="btn btn-secondary"
                    style={{ padding: '9px 12px', fontSize: 13 }}
                    href={`/api/picking/ml-label?shipmentId=${o.mlShipmentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Svg name="bag" s={15} /> Etiqueta Mercado Envíos
                  </a>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', padding: '11px 14px', marginTop: 11 }}>
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => setConfirm({ kind: 'ship', order: o })}
                >
                  <Svg name={o.isStorePickup ? 'shop' : 'truck'} s={18} />
                  {o.isStorePickup ? 'Enviar a tienda' : 'Marcar enviado'}
                </button>
              </div>
            </div>
          );
        })}

        {/* ---------- ENVIADOS ---------- */}
        {tab === 'enviados' && groups.map((g) => (
          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="dgroup">
              <span className="dl">{g.label}</span>
              <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{g.items.length} envío{g.items.length !== 1 ? 's' : ''}</span>
            </div>
            {g.items.map((o) => {
              const delivered = o.fulfillmentStatus === 'delivered' || !!o.deliveredAt;
              const awaitingPickup = o.isStorePickup && o.isSentToStore && !delivered;
              return (
                <div key={o.id} className="card pad0">
                  <div className="lrow between" style={{ paddingBottom: 0 }}>
                    <div className="row gap8">
                      <span style={{ fontSize: 16, fontWeight: 800 }}>#{o.displayId}</span>
                      {delivered
                        ? <span className="badge b-ok"><Svg name="check" s={12} />Entregado</span>
                        : awaitingPickup
                          ? <span className="badge b-pink"><Svg name="shop" s={12} />En tienda</span>
                          : <span className="badge b-info"><Svg name="truck" s={12} />En camino</span>}
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>{timeLabel(dispatchTs(o))}</span>
                  </div>

                  <div style={{ padding: '9px 14px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div className="row between">
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{o.customerName}</span>
                      <CarrierBadge o={o} />
                    </div>
                    {o.address && (
                      <div className="row gap8 muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        <Svg name="pin" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.address}</span>
                      </div>
                    )}
                    {delivered && o.isStorePickup ? (
                      <div className="row gap6 muted" style={{ fontSize: 12 }}>
                        <Svg name="user" s={13} />Retiró: {o.customerName}{o.dni ? ` · DNI ${o.dni}` : ''}
                      </div>
                    ) : o.mlTrackingNumber ? (
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700 }}>{o.mlTrackingNumber}</div>
                    ) : null}
                  </div>

                  {awaitingPickup && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '11px 14px' }}>
                      <button className="btn btn-success btn-block" onClick={() => setConfirm({ kind: 'deliver', order: o })}>
                        <Svg name="check" s={18} /> Marcar entregado
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ---------- Sheet de confirmación ---------- */}
      {confirm && (
        <div className="overlay" onClick={() => !submitting && setConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {confirm.kind === 'ship' ? (
              <>
                <h4>{confirm.order.isStorePickup ? 'Enviar a tienda' : 'Marcar como enviado'}</h4>
                <p>
                  Pedido <b>#{confirm.order.displayId}</b> · {confirm.order.customerName}.{' '}
                  {confirm.order.isStorePickup
                    ? <>Queda disponible para retiro en <b>{confirm.order.storeName || 'la tienda'}</b>.</>
                    : <>Se genera el envío{confirm.order.shippingMethod ? <> en <b>{confirm.order.shippingMethod}</b></> : ''} y se notifica al cliente.</>}
                </p>
              </>
            ) : (
              <>
                <h4>Marcar como entregado</h4>
                <p>Pedido <b>#{confirm.order.displayId}</b> · {confirm.order.customerName}. Confirmás que el cliente lo recibió.</p>
              </>
            )}
            <div className="row gap8" style={{ marginTop: 4 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirm(null)} disabled={submitting}>Cancelar</button>
              <button
                className={`btn ${confirm.kind === 'deliver' ? 'btn-success' : 'btn-primary'}`}
                style={{ flex: 1.3 }}
                onClick={runAction}
                disabled={submitting}
              >
                {submitting ? 'Procesando…' : confirm.kind === 'deliver' ? 'Confirmar entrega' : confirm.order.isStorePickup ? 'Enviar a tienda' : 'Confirmar envío'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none', zIndex: 60 }}>
        <Toast toast={toast} />
      </div>
    </div>
  );
}
