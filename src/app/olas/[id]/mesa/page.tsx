'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Icon, ScanInput, Wave, sum } from '../../_shared';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface Feedback {
  kind: 'ok' | 'err';
  letter?: string;
  ped?: number;
  prod?: string;
  msg?: string;
}

export default function Mesa() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [wave, setWave] = useState<Wave | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

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

  async function onScan(code: string) {
    // Mostramos el estado "leyendo" y limpiamos el resultado anterior para que
    // el que prepara vea claramente que este escaneo se está procesando (y no
    // confunda el cartel del ítem anterior con el actual).
    setScanning(true);
    setFb(null);
    try {
      const data = await api<{
        assignment: { letter: string; orderDisplayId: number; title?: string; sku?: string };
        wave: Wave;
      }>(`/api/picking/waves/${id}/sort`, { method: 'POST', body: { barcode: code } });
      setWave(data.wave);
      setFb({
        kind: 'ok',
        letter: data.assignment.letter,
        ped: data.assignment.orderDisplayId,
        prod: data.assignment.title || data.assignment.sku,
      });
    } catch (e) {
      setFb({ kind: 'err', msg: (e as Error).message });
    } finally {
      setScanning(false);
    }
  }

  async function close() {
    setClosing(true);
    try {
      await api(`/api/picking/waves/${id}/sort/complete`, { method: 'POST' });
      router.push(`/olas/${id}/listo`);
    } catch (e) {
      setError((e as Error).message);
      setClosing(false);
    }
  }

  async function cancelWave() {
    setCancelling(true);
    try {
      await api(`/api/picking/waves/${id}`, { method: 'DELETE', body: { reason: cancelReason.trim() } });
      router.push('/olas');
    } catch (e) {
      setError((e as Error).message);
      setCancelling(false);
    }
  }

  const byLetter = new Map((wave?.orders || []).map((o) => [o.letter, o]));
  const totalReq = wave ? sum(wave.orders.flatMap((o) => o.items.map((i) => i.quantityRequired))) : 0;
  const totalSorted = wave ? sum(wave.orders.flatMap((o) => o.items.map((i) => i.quantitySorted))) : 0;

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push(`/olas`)}><Icon name="back" /></button>
        <div>
          <h3>Ola #{wave?.displayNumber ?? ''} · {wave ? wave.stationId.replace('mesa-', 'Mesa ') : ''}</h3>
          <div className="sub">Clasificación · {totalSorted} / {totalReq} ítems</div>
        </div>
      </header>

      <div className="body">
        {error && <div className="toast err">{error}</div>}
        {!wave && <div className="spin" />}

        {wave && (
          <>
            <ScanInput onScan={onScan} lite placeholder="Escaneá un ítem…" />

            {scanning && (
              <div className="giant">
                <div className="spin" style={{ margin: '8px auto' }} />
                <div className="lbl">Leyendo…</div>
              </div>
            )}

            {!scanning && fb && fb.kind === 'ok' && (
              <div className="giant">
                <div className="lbl">Clasificá en</div>
                <div className="L">{fb.letter}</div>
                <div className="ped">Pedido #{fb.ped}</div>
                {fb.prod && <div className="prod">{fb.prod}</div>}
              </div>
            )}
            {!scanning && fb && fb.kind === 'err' && (
              <div className="giant err">
                <Icon name="x" style={{ width: 46, height: 46, margin: '8px auto 0', display: 'block' }} />
                <div className="errmsg">{fb.msg}</div>
              </div>
            )}

            <div className="wall">
              {LETTERS.map((L) => {
                const o = byLetter.get(L);
                if (!o) {
                  return (
                    <div key={L} className="cell empty">
                      <div className="cl-top"><span className="cl-L">{L}</span></div>
                      <div className="cl-ped">Libre</div>
                    </div>
                  );
                }
                const req = sum(o.items.map((i) => i.quantityRequired));
                const sorted = sum(o.items.map((i) => i.quantitySorted));
                const missing = sum(o.items.map((i) => i.quantityMissing));
                const done = o.status === 'ready';
                const active = fb?.kind === 'ok' && fb.letter === L;
                const pct = req > 0 ? Math.round((sorted / req) * 100) : 0;
                return (
                  <div key={L} className={`cell${done ? ' done' : ''}${active ? ' active' : ''}`}>
                    <div className="cl-top">
                      <span className="cl-L">{L}</span>
                      {done ? (
                        <span className="badge b-ok"><Icon name="check" style={{ width: 13, height: 13 }} />Lista</span>
                      ) : missing > 0 ? (
                        <span className="badge b-warn">Faltan {missing}</span>
                      ) : (
                        <span className="cl-pr" style={{ color: active ? 'var(--pink-fg)' : 'var(--muted)' }}>{sorted}/{req}</span>
                      )}
                    </div>
                    <div className="cl-ped">#{o.orderDisplayId}{done ? ` · ${sorted}/${req}` : ''}</div>
                    <div className="miniprog"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {wave && (
        <footer className="pfoot">
          <button className="btn btn-secondary btn-block" onClick={close} disabled={closing}>
            {closing ? 'Cerrando…' : 'Cerrar clasificación'}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setCancelOpen(true)} disabled={closing}>
            Cancelar ola
          </button>
        </footer>
      )}

      {cancelOpen && (
        <div className="overlay" onClick={() => !cancelling && setCancelOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h4>¿Cancelar la ola #{wave?.displayNumber}?</h4>
            <p>Se cancela la ola y se libera la mesa. Los pedidos vuelven al pool para armar otra ola. Escribí el motivo (mínimo 3 caracteres).</p>
            <textarea
              className="ta"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo (ej: ola armada por error, pedido equivocado)"
            />
            <div className="row gap8" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCancelOpen(false)} disabled={cancelling}>
                Volver
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={cancelWave}
                disabled={cancelling || cancelReason.trim().length < 3}
              >
                {cancelling ? 'Cancelando…' : 'Cancelar ola'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
