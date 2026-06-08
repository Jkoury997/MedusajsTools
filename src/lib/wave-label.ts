import { escapeHtml } from './store-label';

/**
 * Etiqueta de envío de un pedido dentro de una ola (put-to-wall). A diferencia
 * de la etiqueta del transportista (PDF externo de Mercado Envíos), esta la
 * generamos nosotros, así que lleva impresa la LETRA de la mesa (A–H) para que
 * el que empaca sepa a qué pedido pertenece el paquete.
 */
export interface WaveLabelData {
  letter: string;
  orderId: string;
  orderDisplayId: number;
  customerName: string;
  customerPhone: string | null;
  /** "tienda" (retiro) o "envio" (a domicilio / sucursal). */
  destinationKind: 'tienda' | 'envio';
  /** Nombre del destino: tienda de retiro o método/transportista de envío. */
  destinationName: string;
  /** Dirección del destino (vacío si no aplica). */
  destinationAddress: string;
  isCash: boolean;
  orderTotal?: number;
  isML: boolean;
  mlShipmentId: number | null;
  mlTracking?: string | null;
  waveNumber: number;
  stationLabel: string;
}

/** Estilos compartidos de las etiquetas Zebra 100x150mm de la ola. */
const LABEL_STYLES = `
@page { size: 100mm 150mm; margin: 0 !important; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { font-family: Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.z { width: 100mm; height: 150mm; padding: 3mm; overflow: hidden; page-break-after: always; position: relative; }
.z:last-child { page-break-after: auto; }
.hd { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 2.5mm; }
.hd .brand { font-size: 13pt; font-weight: 900; line-height: 1; }
.hd .brand small { display: block; font-size: 6pt; color: #444; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-top: 1mm; }
.letter { background: #000; color: #fff; font-size: 34pt; font-weight: 900; line-height: 1; width: 20mm; height: 20mm; border-radius: 2mm; display: flex; align-items: center; justify-content: center; flex: none; }
.ord { text-align: center; margin-bottom: 2.5mm; }
.ord span { background: #000; color: #fff; font-size: 19pt; font-weight: 900; padding: 1.5mm 5mm; border-radius: 1.5mm; }
.sec { border: 0.5pt solid #888; border-radius: 1mm; padding: 2mm 2.5mm; margin-bottom: 2mm; }
.sec-s { background: #eee; }
.sec small { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 1px; color: #555; font-weight: 700; display: block; }
.sec b { font-size: 9.5pt; display: block; line-height: 1.25; }
.sec i { font-style: normal; font-size: 7.5pt; color: #333; display: block; }
.cash { border: 2pt solid #000; padding: 2mm; text-align: center; margin-bottom: 2mm; }
.cash b { font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; display: block; }
.cash i { font-style: normal; font-size: 8pt; font-weight: 700; display: block; margin-top: 1mm; }
.ft { position: absolute; bottom: 3mm; left: 3mm; right: 3mm; border-top: 0.5pt solid #aaa; padding-top: 1.5mm; display: flex; justify-content: space-between; font-size: 6pt; color: #777; }
`;

/** Bloque HTML de una sola etiqueta (sin <html>), reutilizable en lotes. */
function labelBlock(d: WaveLabelData): string {
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const destLabel = d.destinationKind === 'tienda' ? 'Retirar en' : 'Enviar por';
  return `<div class="z">
  <div class="hd">
    <div class="brand">MARCELA KOURY<small>Etiqueta de envío</small></div>
    <div class="letter">${escapeHtml(d.letter)}</div>
  </div>
  <div class="ord"><span>#${d.orderDisplayId}</span></div>
  ${d.isCash ? `<div class="cash"><b>REQUIERE PAGO EN EFECTIVO</b>${d.orderTotal ? `<i>Cobrar $${Math.round(d.orderTotal).toLocaleString('es-AR')}</i>` : ''}</div>` : ''}
  <div class="sec">
    <small>Cliente</small>
    <b>${escapeHtml(d.customerName)}</b>
    ${d.customerPhone ? `<i>${escapeHtml(d.customerPhone)}</i>` : ''}
  </div>
  <div class="sec sec-s">
    <small>${destLabel}</small>
    <b>${escapeHtml(d.destinationName)}</b>
    ${d.destinationAddress
      ? d.destinationAddress.split('\n').map((line) => `<i>${escapeHtml(line)}</i>`).join('')
      : ''}
    ${d.isML && d.mlTracking ? `<i>Tracking ML: ${escapeHtml(d.mlTracking)}</i>` : ''}
  </div>
  <div class="ft">
    <span>Ola #${d.waveNumber} · ${escapeHtml(d.stationLabel)} · Letra ${escapeHtml(d.letter)}</span>
    <span>${dateStr}</span>
  </div>
</div>`;
}

/** Documento HTML completo con una o varias etiquetas (autoimprime al abrir). */
export function buildWaveLabelsHtml(labels: WaveLabelData[]): string {
  const blocks = labels.map(labelBlock).join('\n');
  const title = labels.length === 1 ? `Etiqueta #${labels[0].orderDisplayId}` : `Etiquetas ola #${labels[0]?.waveNumber ?? ''}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${LABEL_STYLES}</style>
</head>
<body>
${blocks}
<script>setTimeout(function(){ window.print(); }, 250);</script>
</body>
</html>`;
}

/** Abre una ventana e imprime una o varias etiquetas de envío de la ola. */
export function printWaveLabels(labels: WaveLabelData[]): void {
  if (labels.length === 0) return;
  const printWindow = window.open('', '_blank', 'width=380,height=570');
  if (!printWindow) return;
  printWindow.document.write(buildWaveLabelsHtml(labels));
  printWindow.document.close();
}
