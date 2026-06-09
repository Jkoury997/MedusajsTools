'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, Icon, timeAgo, sum, useToast, Toast } from '../olas/_shared';
import { formatPrice } from '@/lib/format';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

// ---------- Tipos (subset de /api/gestion?tab=faltantes) ----------
interface MissingItem {
  lineItemId: string;
  sku?: string;
  barcode?: string;
  title?: string;
  quantityMissing: number;
  unitPrice?: number;
}
interface FaltanteSession {
  totalMissing: number;
  faltanteResolution?: string | null;
  voucherCode?: string;
  voucherValue?: number;
  missingItems: MissingItem[];
}
interface FaltanteOrder {
  id: string;
  displayId: number;
  total: number;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  shippingMethod: string | null;
  isStorePickup: boolean;
  storeName: string | null;
  session: FaltanteSession | null;
}

interface VoucherResult {
  code: string;
  value: number;
  name: string;
  phone: string;
  displayId: number;
}

// ---------- Íconos locales ----------
function ClockIcon() {
  return <svg className="i" viewBox="0 0 24 24" style={{ width: 17, height: 17 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
function TicketIcon() {
  return <svg className="i" viewBox="0 0 24 24" style={{ width: 17, height: 17 }}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
}
function WhatsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function itemLabel(it: MissingItem): string {
  return it.title || it.sku || it.barcode || it.lineItemId;
}

function voucherMessage(name: string, displayId: number, value: number, code: string): string {
  return `Hola ${name}! Te escribimos de Marcela Koury por tu pedido #${displayId}. Lamentamos que algunos artículos no estuvieron disponibles. Te generamos un voucher de compensación por $${value}. Tu código es: *${code}* Podés usarlo en tu próxima compra. Disculpá las molestias!`;
}

export default function FaltantesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<FaltanteOrder[] | null>(null);
  const [error, setError] = useState('');
  const { toast, show } = useToast();

  // Sheet de resolución
  const [sheet, setSheet] = useState<{ kind: 'voucher' | 'waiting'; order: FaltanteOrder } | null>(null);
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voucherResult, setVoucherResult] = useState<VoucherResult | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ orders: FaltanteOrder[] }>('/api/gestion?tab=faltantes');
      setOrders(data.orders);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openVoucher(order: FaltanteOrder) {
    const missingValue = (order.session?.missingItems || []).reduce(
      (s, it) => s + (it.unitPrice || 0) * it.quantityMissing, 0
    );
    setValue(missingValue > 0 ? String(missingValue) : '');
    setNotes('');
    setVoucherResult(null);
    setSheet({ kind: 'voucher', order });
  }

  function openWaiting(order: FaltanteOrder) {
    setNotes('');
    setSheet({ kind: 'waiting', order });
  }

  function closeSheet() {
    setSheet(null);
    setValue('');
    setNotes('');
    setVoucherResult(null);
    setSubmitting(false);
  }

  async function submitWaiting() {
    if (!sheet) return;
    setSubmitting(true);
    try {
      await api('/api/gestion/faltantes', {
        method: 'POST',
        body: { orderId: sheet.order.id, resolution: 'waiting', notes },
      });
      show('ok', `Pedido #${sheet.order.displayId} en espera de reposición`);
      closeSheet();
      load();
    } catch (e) {
      show('err', (e as Error).message);
      setSubmitting(false);
    }
  }

  async function submitVoucher() {
    if (!sheet) return;
    const num = Number(value);
    if (!num || num <= 0) return;
    setSubmitting(true);
    try {
      const data = await api<{
        giftCard: { code: string; value: number };
        customer?: { name: string; phone: string };
        orderDisplayId: number;
      }>('/api/gestion/faltantes/voucher', {
        method: 'POST',
        body: { orderId: sheet.order.id, value: num, notes },
      });
      setVoucherResult({
        code: data.giftCard.code,
        value: data.giftCard.value,
        name: data.customer?.name || sheet.order.customerName,
        phone: data.customer?.phone || sheet.order.customerPhone || '',
        displayId: data.orderDisplayId,
      });
      load();
    } catch (e) {
      show('err', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push('/')}><Icon name="back" /></button>
        <div>
          <h3>Faltantes</h3>
          <div className="sub">
            {orders ? `${orders.length} pedido${orders.length !== 1 ? 's' : ''} para resolver` : 'Cargando…'}
          </div>
        </div>
      </header>

      <div className="body">
        {error && <div className="toast err">{error}</div>}
        {!orders && !error && <div className="spin" />}

        {orders && orders.length === 0 && (
          <div className="empty">
            <div className="ill"><Icon name="check" style={{ width: 38, height: 38 }} /></div>
            <h4>Sin faltantes pendientes</h4>
            <p>No hay pedidos con artículos faltantes por resolver.</p>
          </div>
        )}

        {orders && orders.length > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Pedidos completados con faltante. Resolvé cada uno: esperá la reposición o entregá un voucher por la diferencia.
          </p>
        )}

        {(orders || []).map((order) => {
          const s = order.session;
          const isWaiting = s?.faltanteResolution === 'waiting';
          const totalMissing = s?.totalMissing ?? sum((s?.missingItems || []).map((i) => i.quantityMissing));
          return (
            <div key={order.id} className="card pad0">
              <div className="lrow between" style={{ paddingBottom: 0 }}>
                <div className="row gap10">
                  <span style={{ fontSize: 15, fontWeight: 800 }}>#{order.displayId}</span>
                  {isWaiting
                    ? <span className="badge b-warn">En espera</span>
                    : order.isStorePickup
                      ? <span className="badge b-pink">Retiro en tienda</span>
                      : order.shippingMethod
                        ? <span className="badge b-info">{order.shippingMethod}</span>
                        : null}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{timeAgo(order.createdAt)}</span>
              </div>

              <div style={{ padding: '8px 14px 0' }}>
                <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {order.customerName}{order.isStorePickup && order.storeName ? ` · ${order.storeName}` : ''}
                </div>
              </div>

              <div style={{ padding: '10px 14px 0' }}>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 11, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
                    {totalMissing === 1 ? 'Falta 1 unidad' : `Faltan ${totalMissing} unidades`}
                  </div>
                  {(s?.missingItems || []).map((it, i) => (
                    <div key={i} className="row between" style={{ fontSize: 12.5, color: '#991b1b', marginTop: i > 0 ? 4 : 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel(it)}</span>
                      <span style={{ fontWeight: 800, flex: 'none', marginLeft: 8 }}>×{it.quantityMissing}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lrow gap8" style={{ paddingTop: 12 }}>
                {isWaiting ? (
                  <button className="btn btn-success" style={{ flex: 1, gap: 7 }} onClick={() => router.push(`/pedido/${order.id}`)}>
                    <ClockIcon /> Recibir
                  </button>
                ) : (
                  <button className="btn btn-secondary" style={{ flex: 1, gap: 7 }} onClick={() => openWaiting(order)}>
                    <ClockIcon /> Esperar stock
                  </button>
                )}
                <button className="btn btn-primary" style={{ flex: 1, gap: 7 }} onClick={() => openVoucher(order)}>
                  <TicketIcon /> Voucher
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- Sheet: Esperar stock ---------- */}
      {sheet?.kind === 'waiting' && (
        <div className="overlay" onClick={closeSheet}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--warn-bg)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <ClockIcon />
            </div>
            <h4>Esperar reposición</h4>
            <p>El pedido <b>#{sheet.order.displayId}</b> queda <b>en espera</b>. Cuando llegue la mercadería, lo recibís por escaneo y pasa a “Por enviar”. No se envía hasta entonces.</p>
            <textarea
              className="ta"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional): reposición estimada, cliente avisado…"
              style={{ marginBottom: 14 }}
            />
            <div className="row gap8">
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeSheet} disabled={submitting}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={submitWaiting} disabled={submitting}>
                {submitting ? 'Guardando…' : 'Dejar en espera'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Sheet: Voucher ---------- */}
      {sheet?.kind === 'voucher' && (
        <div className="overlay" onClick={closeSheet}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {!voucherResult ? (
              <>
                <h4>Crear voucher</h4>
                <p>Pedido <b>#{sheet.order.displayId}</b> · {sheet.order.customerName}. Se emite un voucher por la diferencia y el pedido pasa a “Por enviar”.</p>
                {(sheet.order.session?.missingItems || []).some((i) => i.unitPrice) && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 11, padding: '10px 12px', marginBottom: 14 }}>
                    {(sheet.order.session?.missingItems || []).map((it, i) => (
                      <div key={i} className="row between" style={{ fontSize: 12.5, color: '#991b1b', marginTop: i > 0 ? 4 : 0 }}>
                        <span>{itemLabel(it)} ×{it.quantityMissing}</span>
                        <span style={{ fontWeight: 800 }}>{formatPrice((it.unitPrice || 0) * it.quantityMissing)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4b5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Valor del voucher</label>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontWeight: 800, fontSize: 18 }}>$</span>
                  <input
                    className="ta"
                    type="number"
                    min="1"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    style={{ padding: '14px 14px 14px 30px', fontSize: 20, fontWeight: 800 }}
                  />
                </div>
                <textarea
                  className="ta"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas (opcional): cliente avisado por WhatsApp…"
                />
                <div className="row gap8" style={{ marginTop: 14 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeSheet} disabled={submitting}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={submitVoucher} disabled={submitting || !value || Number(value) <= 0}>
                    {submitting ? 'Creando…' : `Crear voucher ${value ? formatPrice(Number(value)) : ''}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--ok)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <Icon name="check" style={{ width: 28, height: 28, strokeWidth: 3 }} />
                  </div>
                  <h4 style={{ marginBottom: 2 }}>Voucher creado</h4>
                </div>
                <div style={{ background: 'var(--pink-50)', border: '1px solid var(--pink-100)', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pink-fg)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Código</div>
                  <div style={{ fontSize: 24, fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: 'var(--pink-fg)', letterSpacing: '.06em' }}>{voucherResult.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{formatPrice(voucherResult.value)}</div>
                </div>
                <a
                  className="btn btn-success btn-block"
                  href={voucherResult.phone
                    ? buildWhatsAppUrl(voucherResult.phone, voucherMessage(voucherResult.name, voucherResult.displayId, voucherResult.value, voucherResult.code))
                    : `https://wa.me/?text=${encodeURIComponent(voucherMessage(voucherResult.name, voucherResult.displayId, voucherResult.value, voucherResult.code))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsIcon /> {voucherResult.phone ? 'Enviar por WhatsApp' : 'Abrir WhatsApp'}
                </a>
                <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }} onClick={closeSheet}>Cerrar</button>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none', zIndex: 60 }}>
        <Toast toast={toast} />
      </div>
    </div>
  );
}
