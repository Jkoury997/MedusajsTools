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

export default function StoreLabel({ orderDisplayId, customerName, customerPhone, storeName, storeAddress }: StoreLabelProps) {
  const [showLabel, setShowLabel] = useState(false);

  const whatsappUrl = customerPhone
    ? buildWhatsAppUrl(customerPhone, orderDisplayId, storeName)
    : '';

  const qrUrl = whatsappUrl ? buildQRUrl(whatsappUrl, 200) : '';

  const printLabel = useCallback(() => {
    // Abrir ventana nueva solo con la etiqueta — forma más confiable de imprimir
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const dateStr = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Etiqueta #${orderDisplayId}</title>
  <style>
    @page { size: 100mm 150mm; margin: 5mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; width: 90mm; margin: 0 auto; padding: 3mm; color: #111; }
    .header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; text-align: center; }
    .brand { font-size: 18px; font-weight: 900; letter-spacing: -0.5px; }
    .subtitle { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 3px; margin-top: 2px; }
    .order-box { background: #000; color: #fff; border-radius: 8px; padding: 8px 16px; display: inline-block; margin-bottom: 10px; text-align: center; }
    .order-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; }
    .order-number { font-size: 28px; font-weight: 900; line-height: 1.1; }
    .section { border: 1px solid #ccc; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: left; }
    .section-store { background: #f5f5f5; }
    .section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #888; font-weight: 600; margin-bottom: 4px; }
    .section-name { font-size: 13px; font-weight: 700; }
    .section-detail { font-size: 11px; color: #555; margin-top: 2px; }
    .qr-area { text-align: center; margin-bottom: 10px; }
    .qr-box { display: inline-block; border: 2px solid #ccc; border-radius: 8px; padding: 8px; background: #fff; }
    .qr-box img { display: block; width: 140px; height: 140px; }
    .qr-text { font-size: 9px; color: #888; margin-top: 6px; line-height: 1.4; }
    .no-phone { background: #fef9c3; border: 1px solid #eab308; border-radius: 8px; padding: 8px; text-align: center; margin-bottom: 10px; }
    .no-phone p { font-size: 11px; color: #854d0e; font-weight: 500; }
    .footer { border-top: 1px solid #ccc; padding-top: 6px; text-align: center; }
    .footer-date { font-size: 8px; color: #aaa; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">MARCELA KOURY</div>
    <div class="subtitle">Retiro en Tienda</div>
  </div>

  <div class="center">
    <div class="order-box">
      <div class="order-label">Pedido</div>
      <div class="order-number">#${orderDisplayId}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Cliente</div>
    <div class="section-name">${escapeHtml(customerName)}</div>
    ${customerPhone ? `<div class="section-detail">${escapeHtml(customerPhone)}</div>` : ''}
  </div>

  <div class="section section-store">
    <div class="section-label">Retirar en</div>
    <div class="section-name">${escapeHtml(storeName)}</div>
    ${storeAddress ? `<div class="section-detail">${escapeHtml(storeAddress)}</div>` : ''}
  </div>

  ${qrUrl ? `
  <div class="qr-area">
    <div class="qr-box">
      <img src="${qrUrl}" alt="QR WhatsApp" />
    </div>
    <div class="qr-text">
      Escaneá el QR para avisar por<br>WhatsApp que el pedido está listo
    </div>
  </div>
  ` : ''}

  ${!customerPhone ? `
  <div class="no-phone">
    <p>Sin teléfono registrado - avisar por email</p>
  </div>
  ` : ''}

  <div class="footer">
    <div class="footer-date">${dateStr}</div>
  </div>

  <script>
    // Esperar que el QR cargue y luego imprimir
    ${qrUrl ? `
    const img = document.querySelector('.qr-box img');
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

  // Botón para mostrar/imprimir etiqueta
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

      {/* Preview de etiqueta en pantalla */}
      <div className="border-2 border-dashed border-purple-300 rounded-xl p-4 bg-purple-50">
        <p className="text-xs text-purple-600 font-medium text-center mb-3">Vista previa de la etiqueta</p>
        <div className="bg-white rounded-lg border border-gray-300 p-4 max-w-sm mx-auto">
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Preview en pantalla (no se imprime desde acá)
function LabelPreview({
  orderDisplayId,
  customerName,
  customerPhone,
  storeName,
  storeAddress,
  qrUrl,
}: {
  orderDisplayId: number;
  customerName: string;
  customerPhone: string | null;
  storeName: string;
  storeAddress: string;
  qrUrl: string;
}) {
  return (
    <div className="text-center">
      <div className="border-b-2 border-black pb-2 mb-3">
        <h1 className="text-xl font-black tracking-tight">MARCELA KOURY</h1>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Retiro en Tienda</p>
      </div>

      <div className="bg-black text-white rounded-lg py-2.5 px-4 mb-3 inline-block">
        <p className="text-[10px] uppercase tracking-wider font-medium opacity-80">Pedido</p>
        <p className="text-3xl font-black leading-tight">#{orderDisplayId}</p>
      </div>

      <div className="border border-gray-300 rounded-lg p-3 mb-3 text-left">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Cliente</p>
        <p className="text-sm font-bold text-gray-900">{customerName}</p>
        {customerPhone && <p className="text-xs text-gray-600 mt-0.5">{customerPhone}</p>}
      </div>

      <div className="border border-gray-300 rounded-lg p-3 mb-3 text-left bg-gray-50">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Retirar en</p>
        <p className="text-sm font-bold text-gray-900">{storeName}</p>
        {storeAddress && <p className="text-xs text-gray-600 mt-0.5">{storeAddress}</p>}
      </div>

      {qrUrl && (
        <div className="mb-3">
          <div className="inline-block border-2 border-gray-300 rounded-lg p-2 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR WhatsApp" width={140} height={140} className="mx-auto" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">
            Escaneá el QR para avisar por<br />WhatsApp que el pedido está listo
          </p>
        </div>
      )}

      {!customerPhone && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-2 mb-3">
          <p className="text-xs text-yellow-800 font-medium">Sin teléfono registrado - avisar por email</p>
        </div>
      )}

      <div className="border-t border-gray-300 pt-2 mt-2">
        <p className="text-[9px] text-gray-400">
          {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
