'use client';

import { useState, useCallback } from 'react';
import { printStoreLabel } from '@/lib/store-label';
import { buildPickupReadyUrl, buildQRUrl } from '@/lib/whatsapp';
import { Button } from '@/components/ui';

interface StoreLabelProps {
  orderDisplayId: number;
  customerName: string;
  customerPhone: string | null;
  storeName: string;
  storeAddress: string;
  isCashPayment?: boolean;
  orderTotal?: number;
}

export default function StoreLabel({ orderDisplayId, customerName, customerPhone, storeName, storeAddress, isCashPayment = false, orderTotal }: StoreLabelProps) {
  const [showLabel, setShowLabel] = useState(false);

  const whatsappUrl = customerPhone
    ? buildPickupReadyUrl(customerPhone, orderDisplayId, storeName)
    : '';

  const qrUrl = whatsappUrl ? buildQRUrl(whatsappUrl, 200) : '';

  const printLabel = useCallback(() => {
    printStoreLabel({
      orderDisplayId,
      customerName,
      customerPhone,
      storeName,
      storeAddress,
      isCashPayment,
      orderTotal,
    });
  }, [orderDisplayId, customerName, customerPhone, storeName, storeAddress, isCashPayment, orderTotal]);

  function handlePrintLabel() {
    setShowLabel(true);
    printLabel();
  }

  if (!showLabel) {
    return (
      <Button
        onClick={handlePrintLabel}
        fullWidth
        size="lg"
        className="!bg-purple-600 hover:!bg-purple-700 shadow-lg print:hidden"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Imprimir Etiqueta de Tienda
      </Button>
    );
  }

  return (
    <div className="print:hidden space-y-2 mb-4">
      <div className="flex gap-2">
        <Button onClick={printLabel} fullWidth className="!bg-purple-600 hover:!bg-purple-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Reimprimir Etiqueta
        </Button>
        <Button variant="secondary" onClick={() => setShowLabel(false)}>
          Cerrar
        </Button>
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
        <p className="text-xl font-black leading-tight">#{orderDisplayId}</p>
      </div>

      <div className="border border-gray-300 rounded-md p-1.5 text-left mb-1.5">
        <p className="text-[7px] uppercase tracking-wider text-gray-500 font-semibold">Cliente</p>
        <p className="text-[11px] font-bold text-gray-900 leading-tight">{customerName}</p>
        {customerPhone && <p className="text-[9px] text-gray-600">{customerPhone}</p>}
      </div>

      <div className="border border-gray-300 rounded-md p-1.5 text-left bg-gray-50 mb-2">
        <p className="text-[7px] uppercase tracking-wider text-gray-500 font-semibold">Retirar en</p>
        <p className="text-[11px] font-bold text-gray-900 leading-tight">{storeName}</p>
        {storeAddress && <p className="text-[9px] text-gray-600">{storeAddress}</p>}
      </div>

      {qrUrl && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="border border-gray-300 rounded-md p-1.5 bg-white inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR" width={110} height={110} className="mx-auto" />
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
