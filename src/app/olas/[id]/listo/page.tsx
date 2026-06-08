'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Icon, Wave, sum } from '../../_shared';

export default function Listo() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [wave, setWave] = useState<Wave | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await api<{ wave: Wave }>(`/api/picking/waves/${id}`);
        if (!ignore) setWave(data.wave);
      } catch (e) {
        if (!ignore) setError((e as Error).message);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  async function send() {
    setSending(true);
    setError('');
    try {
      const data = await api<{ wave: Wave; message: string }>(`/api/picking/waves/${id}/complete`, {
        method: 'POST',
      });
      setWave(data.wave);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const orders = wave?.orders || [];
  const missingFor = (o: Wave['orders'][number]) => sum(o.items.map((i) => i.quantityMissing));
  const sinFaltante = orders.filter((o) => missingFor(o) === 0).length;
  const completed = wave?.status === 'completed';

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push(`/olas`)}><Icon name="back" /></button>
        <div>
          <h3>Ola #{wave?.displayNumber ?? ''}</h3>
          <div className="sub">{completed ? 'Enviada al flujo' : 'Lista para enviar'}</div>
        </div>
      </header>

      <div className="body">
        {error && <div className="toast err">{error}</div>}
        {!wave && <div className="spin" />}

        {wave && (
          <>
            <div className="card" style={{ background: 'var(--ok-bg)', borderColor: '#bbf7d0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--ok)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="check" style={{ strokeWidth: 3 }} />
              </span>
              <div>
                <div style={{ fontWeight: 800, color: '#15803d', fontSize: 15 }}>
                  {completed ? 'Pedidos enviados al flujo' : 'Clasificación completa'}
                </div>
                <div style={{ fontSize: 12.5, color: '#166534' }}>
                  {sinFaltante} de {orders.length} pedidos sin faltantes
                </div>
              </div>
            </div>

            <div className="card pad0">
              {orders.map((o, idx) => {
                const missing = missingFor(o);
                return (
                  <div key={o.id}>
                    {idx > 0 && <div className="divide" />}
                    <div className="lrow between">
                      <div className="row gap12">
                        <span
                          className="lcircle"
                          style={missing > 0
                            ? { background: 'var(--warn-bg)', color: '#b45309' }
                            : { background: 'var(--ok-bg)', color: '#15803d' }}
                        >
                          {o.letter}
                        </span>
                        <div>
                          <div className="ttl">Pedido #{o.orderDisplayId}</div>
                          <div className="row gap6" style={{ marginTop: 3 }}>
                            <span className="badge b-ok">Listo</span>
                            {missing > 0 && <span className="badge b-warn">Faltan {missing}</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '9px 13px', fontSize: 13 }}
                        onClick={() => router.push(`/pedido/${o.orderId}`)}
                      >
                        Ir al pedido
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!completed && (
              <div className="card" style={{ background: 'var(--info-bg)', borderColor: '#bfdbfe', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="info" style={{ color: 'var(--info)', flex: 'none', marginTop: 1 }} />
                <div style={{ fontSize: 13, color: '#1e40af' }}>
                  Al enviar, cada pedido se despacha en Medusa y entra en el flujo de envío/etiqueta. Los que tengan faltante quedan pendientes de recepción.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {wave && (
        <footer className="pfoot">
          <button className="btn btn-secondary btn-block" onClick={() => router.push(`/olas/${id}/etiquetas`)}>
            <Icon name="print" /> Imprimir etiquetas de envío
          </button>
          {completed ? (
            <button className="btn btn-primary btn-block btn-lg" onClick={() => router.push(`/olas`)}>
              Volver a olas
            </button>
          ) : (
            <button className="btn btn-success btn-block btn-lg" onClick={send} disabled={sending}>
              {sending ? 'Enviando…' : 'Cerrar y enviar pedidos'}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
