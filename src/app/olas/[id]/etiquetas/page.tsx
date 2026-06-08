'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Icon } from '../../_shared';
import { printWaveLabels, type WaveLabelData } from '@/lib/wave-label';

export default function Etiquetas() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [labels, setLabels] = useState<WaveLabelData[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await api<{ labels: WaveLabelData[] }>(`/api/picking/waves/${id}/labels`);
        if (!ignore) setLabels(data.labels);
      } catch (e) {
        if (!ignore) setError((e as Error).message);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  const waveNumber = labels?.[0]?.waveNumber;

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push(`/olas/${id}/listo`)}><Icon name="back" /></button>
        <div>
          <h3>Ola #{waveNumber ?? ''} · Etiquetas</h3>
          <div className="sub">Etiqueta de envío con la letra de cada pedido</div>
        </div>
      </header>

      <div className="body">
        {error && <div className="toast err">{error}</div>}
        {!labels && !error && <div className="spin" />}

        {labels && labels.length === 0 && (
          <div className="empty">
            <div className="ill"><Icon name="print" /></div>
            <h4>Sin pedidos</h4>
            <p>Esta ola no tiene pedidos para etiquetar.</p>
          </div>
        )}

        {labels && labels.length > 0 && (
          <div className="card pad0">
            {labels.map((l, idx) => (
              <div key={l.orderId}>
                {idx > 0 && <div className="divide" />}
                <div className="lrow between">
                  <div className="row gap12">
                    <span className="lcircle">{l.letter}</span>
                    <div>
                      <div className="ttl">Pedido #{l.orderDisplayId}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                        {l.customerName}
                      </div>
                      <div className="row gap6" style={{ marginTop: 4 }}>
                        <span className="badge b-gray">{l.destinationName}</span>
                        {l.isCash && <span className="badge b-warn">Efectivo</span>}
                      </div>
                    </div>
                  </div>
                  <div className="row gap8" style={{ flex: 'none' }}>
                    {l.isML && (
                      <a
                        className="btn btn-secondary"
                        style={{ padding: '9px 13px', fontSize: 13 }}
                        href={`/api/picking/ml-label?${l.mlShipmentId ? `shipmentId=${l.mlShipmentId}` : `orderId=${l.orderId}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Etiqueta ML
                      </a>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ padding: '9px 13px', fontSize: 13 }}
                      onClick={() => printWaveLabels([l])}
                    >
                      <Icon name="print" style={{ width: 16, height: 16 }} /> Imprimir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {labels && labels.length > 0 && (
        <footer className="pfoot">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => printWaveLabels(labels)}>
            <Icon name="print" /> Imprimir todas ({labels.length})
          </button>
        </footer>
      )}
    </div>
  );
}
