import { buildQRUrl, buildPickupReadyUrl } from './whatsapp';

export interface StoreLabelData {
  orderDisplayId: number;
  customerName: string;
  customerPhone: string | null;
  storeName: string;
  storeAddress: string;
  isCashPayment?: boolean;
  orderTotal?: number;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Genera el HTML de la etiqueta Zebra 100x150mm para imprimir (retiro en tienda).
 * Fuente única: la usan StoreLabel.tsx (pedido) y gestion/page.tsx.
 */
export function buildStoreLabelHtml(data: StoreLabelData): string {
  const { orderDisplayId, customerName, customerPhone, storeName, storeAddress, isCashPayment = false, orderTotal } = data;

  const whatsappUrl = customerPhone ? buildPickupReadyUrl(customerPhone, orderDisplayId, storeName) : '';
  const qrUrl = whatsappUrl ? buildQRUrl(whatsappUrl, 200) : '';
  const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiqueta #${orderDisplayId}</title>
<style>
@page { size: 100mm 150mm; margin: 0 !important; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100mm; height: 150mm; max-width: 100mm; max-height: 150mm;
  margin: 0 !important; padding: 0 !important; overflow: hidden !important;
  font-family: Arial, sans-serif; color: #000;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.z { width: 94mm; max-width: 94mm; height: 144mm; max-height: 144mm; margin: 3mm; overflow: hidden; }
.hd { border-bottom: 1.5pt solid #000; padding-bottom: 1.5mm; margin-bottom: 2.5mm; text-align: center; }
.hd h1 { font-size: 15pt; font-weight: 900; }
.hd p { font-size: 6.5pt; color: #444; text-transform: uppercase; letter-spacing: 2px; }
.ord { text-align: center; margin-bottom: 2.5mm; }
.ord span { background: #000; color: #fff; font-size: 20pt; font-weight: 900; padding: 1.5mm 5mm; border-radius: 1.5mm; }
.sec { border: 0.5pt solid #888; border-radius: 1mm; padding: 2mm 2.5mm; margin-bottom: 2mm; }
.sec-s { background: #eee; }
.sec small { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 1px; color: #555; font-weight: 700; display: block; }
.sec b { font-size: 9pt; display: block; line-height: 1.25; }
.sec i { font-style: normal; font-size: 7.5pt; color: #333; display: block; }
.qr { text-align: center; margin-top: 2mm; }
.qr img { width: 40mm; height: 40mm; border: 1pt solid #aaa; border-radius: 1.5mm; padding: 1mm; }
.qr p { font-size: 6.5pt; color: #444; margin-top: 1.5mm; line-height: 1.3; }
.np { text-align: center; margin-top: 3mm; font-size: 7.5pt; font-weight: 600; color: #333; }
.ft { text-align: center; margin-top: 3mm; font-size: 5.5pt; color: #999; }
.cash { border: 2pt solid #000; padding: 2.5mm; text-align: center; margin-bottom: 2.5mm; }
.cash b { font-size: 12pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; display: block; }
.cash i { font-style: normal; font-size: 8pt; font-weight: 700; display: block; margin-top: 1mm; }
</style>
</head>
<body>
<div class="z">
  <div class="hd">
    <h1>MARCELA KOURY</h1>
    <p>Retiro en Tienda</p>
  </div>
  <div class="ord"><span>#${orderDisplayId}</span></div>
  ${isCashPayment ? `<div class="cash"><b>REQUIERE PAGO EN EFECTIVO</b>${orderTotal ? `<i>Cobrar $${Math.round(orderTotal).toLocaleString('es-AR')}</i>` : ''}</div>` : ''}
  <div class="sec">
    <small>Cliente</small>
    <b>${escapeHtml(customerName)}</b>
    ${customerPhone ? `<i>${escapeHtml(customerPhone)}</i>` : ''}
  </div>
  <div class="sec sec-s">
    <small>Retirar en</small>
    <b>${escapeHtml(storeName)}</b>
    ${storeAddress ? `<i>${escapeHtml(storeAddress)}</i>` : ''}
  </div>
  ${qrUrl ? `<div class="qr"><img src="${qrUrl}" alt="QR" /><p>Escaneá para avisar por WhatsApp<br>que el pedido está listo</p></div>` : ''}
  ${!customerPhone ? `<div class="np">Sin teléfono - avisar por email</div>` : ''}
  <div class="ft">${dateStr}</div>
</div>
<script>
${qrUrl ? `var img = document.querySelector('.qr img');
if (img && !img.complete) { img.onload = function(){ setTimeout(function(){ window.print(); }, 100); }; img.onerror = function(){ window.print(); }; }
else { setTimeout(function(){ window.print(); }, 300); }` : `setTimeout(function(){ window.print(); }, 200);`}
</script>
</body>
</html>`;
}

/** Abre una ventana e imprime la etiqueta. */
export function printStoreLabel(data: StoreLabelData): void {
  const printWindow = window.open('', '_blank', 'width=380,height=570');
  if (!printWindow) return;
  printWindow.document.write(buildStoreLabelHtml(data));
  printWindow.document.close();
}
