'use client';

import { useState, useCallback } from 'react';

interface StoreLabelProps {
  orderDisplayId: number;
  customerName: string;
  customerPhone: string | null;
  storeName: string;
  storeAddress: string;
}

// Formatea número de teléfono para WhatsApp Argentina
function formatWhatsAppNumber(phone: string): string {
  let cleanNumber = phone.replace(/\D/g, '');
  if (cleanNumber.startsWith('54')) return cleanNumber;
  if (cleanNumber.startsWith('0')) cleanNumber = cleanNumber.substring(1);
  if (cleanNumber.startsWith('15')) cleanNumber = cleanNumber.substring(2);
  if (cleanNumber.length === 10) return `54${cleanNumber}`;
  if (cleanNumber.length === 8) return `5411${cleanNumber}`;
  return `54${cleanNumber}`;
}

function buildWhatsAppUrl(phone: string, orderDisplayId: number, storeName: string): string {
  const waNumber = formatWhatsAppNumber(phone);
  const message = encodeURIComponent(
    `Hola! Te escribimos de Marcela Koury. Tu pedido #${orderDisplayId} ya se encuentra disponible para retirar en nuestra tienda ${storeName}. Te esperamos!`
  );
  return `https://wa.me/${waNumber}?text=${message}`;
}

function buildQRUrl(data: string, size: number = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=png`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function StoreLabel({ orderDisplayId, customerName, customerPhone, storeName, storeAddress }: StoreLabelProps) {
  const [showLabel, setShowLabel] = useState(false);

  const whatsappUrl = customerPhone
    ? buildWhatsAppUrl(customerPhone, orderDisplayId, storeName)
    : '';

  const qrUrl = whatsappUrl ? buildQRUrl(whatsappUrl, 200) : '';

  const printLabel = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=380,height=570');
    if (!printWindow) return;

    const dateStr = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    // Etiqueta Zebra 100x150mm — todo en UNA sola etiqueta
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Etiqueta #${orderDisplayId}</title>
  <style>
    @page {
      size: 100mm 150mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100mm;
      height: 150mm;
      max-height: 150mm;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 100mm;
      height: 150mm;
      max-height: 150mm;
      padding: 4mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .header {
      border-bottom: 2pt solid #000;
      padding-bottom: 2mm;
      margin-bottom: 3mm;
      text-align: center;
    }
    .brand { font-size: 16pt; font-weight: 900; letter-spacing: -0.3px; }
    .subtitle { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: 2px; margin-top: 1mm; }
    .order-row {
      text-align: center;
      margin-bottom: 3mm;
    }
    .order-box {
      background: #000;
      color: #fff;
      border-radius: 2mm;
      padding: 2mm 5mm;
      display: inline-block;
    }
    .order-label { font-size: 6pt; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85; }
    .order-number { font-size: 22pt; font-weight: 900; line-height: 1.1; }
    .info-row {
      display: flex;
      gap: 2mm;
      margin-bottom: 2.5mm;
    }
    .info-box {
      flex: 1;
      border: 0.5pt solid #999;
      border-radius: 1.5mm;
      padding: 2mm 2.5mm;
    }
    .info-box-store { background: #f0f0f0; }
    .info-label { font-size: 5.5pt; text-transform: uppercase; letter-spacing: 1.5px; color: #666; font-weight: 700; margin-bottom: 0.5mm; }
    .info-name { font-size: 9pt; font-weight: 700; line-height: 1.2; }
    .info-detail { font-size: 7.5pt; color: #444; margin-top: 0.5mm; }
    .qr-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-box {
      border: 1pt solid #ccc;
      border-radius: 2mm;
      padding: 2mm;
      background: #fff;
      line-height: 0;
    }
    .qr-box img { width: 30mm; height: 30mm; display: block; }
    .qr-text { font-size: 6.5pt; color: #666; margin-top: 1.5mm; text-align: center; line-height: 1.3; }
    .no-phone {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .no-phone-box { border: 0.5pt solid #999; border-radius: 1.5mm; padding: 3mm; text-align: center; }
    .no-phone-box p { font-size: 8pt; font-weight: 600; color: #333; }
    .footer {
      border-top: 0.5pt solid #ccc;
      padding-top: 1.5mm;
      text-align: center;
      margin-top: auto;
    }
    .footer-date { font-size: 6pt; color: #999; }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      <div class="brand">MARCELA KOURY</div>
      <div class="subtitle">Retiro en Tienda</div>
    </div>

    <div class="order-row">
      <div class="order-box">
        <div class="order-label">Pedido</div>
        <div class="order-number">#${orderDisplayId}</div>
      </div>
    </div>

    <div class="info-row">
      <div class="info-box">
        <div class="info-label">Cliente</div>
        <div class="info-name">${escapeHtml(customerName)}</div>
        ${customerPhone ? `<div class="info-detail">${escapeHtml(customerPhone)}</div>` : ''}
      </div>
      <div class="info-box info-box-store">
        <div class="info-label">Retirar en</div>
        <div class="info-name">${escapeHtml(storeName)}</div>
        ${storeAddress ? `<div class="info-detail">${escapeHtml(storeAddress)}</div>` : ''}
      </div>
    </div>

    ${qrUrl ? `
    <div class="qr-area">
      <div class="qr-box">
        <img src="${qrUrl}" alt="QR" />
      </div>
      <div class="qr-text">Escane\u00e1 para avisar por WhatsApp<br>que el pedido est\u00e1 listo</div>
    </div>
    ` : ''}

    ${!customerPhone ? `
    <div class="no-phone">
      <div class="no-phone-box">
        <p>Sin tel\u00e9fono registrado</p>
        <p>Avisar por email</p>
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div class="footer-date">${dateStr}</div>
    </div>
  </div>

  <script>
    ${qrUrl ? `
    var img = document.querySelector('.qr-box img');
    if (img && !img.complete) {
      img.onload = function() { setTimeout(function() { window.print(); }, 100); };
      img.onerror = function() { window.print(); };
    } else {
      setTimeout(function() { window.print(); }, 300);
    }
    ` : `setTimeout(function() { window.print(); }, 200);`}
  </script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  }, [orderDisplayId, customerName, customerPhone, storeName, storeAddress, qrUrl]);

  function handlePrintLabel() {
    setShowLabel(true);
    printLabel();
  }

  if (!showLabel) {
    return (
      <button
        onClick={handlePrintLabel}
        className="w-full bg-purple-600 text-white py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2.5 hover:bg-purple-700 transition-colors shadow-lg print:hidden"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Imprimir Etiqueta de Tienda
      </button>
    );
  }

  return (
    <div className="print:hidden space-y-2 mb-4">
      <div className="flex gap-2">
        <button
          onClick={printLabel}
          className="flex-1 bg-purple-600 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Reimprimir Etiqueta
        </button>
        <button
          onClick={() => setShowLabel(false)}
          className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
        >
          Cerrar
        </button>
      </div>

      {/* Preview */}
      <div className="border-2 border-dashed border-purple-300 rounded-xl p-3 bg-purple-50">
        <p className="text-xs text-purple-600 font-medium text-center mb-2">Vista previa de etiqueta (100x150mm)</p>
        <div className="bg-white rounded-lg border border-gray-300 p-3 max-w-[280px] mx-auto aspect-[100/150]">
          <LabelPreview
            orderDisplayId={orderDisplayId}
            customerName={customerName}
            customerPhone={customerPhone}
            storeName={storeName}
            storeAddress={storeAddress}
            qrUrl={qrUrl}
          />
        </div>
      </div>
    </div>
  );
}

// Preview en pantalla — proporcional a 100x150mm
function LabelPreview({
  orderDisplayId, customerName, customerPhone, storeName, storeAddress, qrUrl,
}: {
  orderDisplayId: number; customerName: string; customerPhone: string | null;
  storeName: string; storeAddress: string; qrUrl: string;
}) {
  return (
    <div className="text-center flex flex-col h-full">
      <div className="border-b-2 border-black pb-1.5 mb-2">
        <h1 className="text-base font-black tracking-tight leading-tight">MARCELA KOURY</h1>
        <p className="text-[8px] text-gray-500 uppercase tracking-widest">Retiro en Tienda</p>
      </div>

      <div className="bg-black text-white rounded-md py-1.5 px-3 mb-2 inline-block mx-auto">
        <p className="text-[7px] uppercase tracking-wider font-medium opacity-80">Pedido</p>
        <p className="text-xl font-black leading-tight">#{orderDisplayId}</p>
      </div>

      <div className="flex gap-1.5 mb-2">
        <div className="flex-1 border border-gray-300 rounded-md p-1.5 text-left">
          <p className="text-[7px] uppercase tracking-wider text-gray-500 font-semibold">Cliente</p>
          <p className="text-[10px] font-bold text-gray-900 leading-tight">{customerName}</p>
          {customerPhone && <p className="text-[8px] text-gray-600">{customerPhone}</p>}
        </div>
        <div className="flex-1 border border-gray-300 rounded-md p-1.5 text-left bg-gray-50">
          <p className="text-[7px] uppercase tracking-wider text-gray-500 font-semibold">Retirar en</p>
          <p className="text-[10px] font-bold text-gray-900 leading-tight">{storeName}</p>
          {storeAddress && <p className="text-[8px] text-gray-600">{storeAddress}</p>}
        </div>
      </div>

      {qrUrl && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="border border-gray-300 rounded-md p-1.5 bg-white inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR" width={90} height={90} className="mx-auto" />
          </div>
          <p className="text-[7px] text-gray-500 mt-1 leading-tight">
            Escaneá para avisar por WhatsApp
          </p>
        </div>
      )}

      {!customerPhone && (
        <div className="flex-1 flex items-center justify-center">
          <div className="border border-gray-300 rounded-md p-2 text-center">
            <p className="text-[9px] font-semibold text-gray-700">Sin teléfono - avisar por email</p>
          </div>
        </div>
      )}

      <div className="border-t border-gray-300 pt-1 mt-auto">
        <p className="text-[7px] text-gray-400">
          {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
