/**
 * Cambia el `type` (label/description/code) de una shipping option de Medusa.
 *
 * Uso:
 *   npx tsx scripts/set-shipping-type.ts <shipping_option_id> <code> [label] [description]
 *
 * Ejemplo (marcar el retiro en sucursal del Correo con un code propio):
 *   npx tsx scripts/set-shipping-type.ts so_01KT292B63NQV2091FPT22334C correo_pickup "Correo - Retiro en sucursal"
 *
 * Requiere MEDUSA_BACKEND_URL y MEDUSA_SECRET_API_KEY (en .env.local o el env).
 */
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

import { medusaRequest } from '../src/lib/medusa';

interface ShippingOption {
  id: string;
  name: string;
  type?: { id?: string; code?: string; label?: string; description?: string } | null;
}

async function main() {
  const [id, code, label, description] = process.argv.slice(2);
  if (!id || !code) {
    console.error('Uso: npx tsx scripts/set-shipping-type.ts <shipping_option_id> <code> [label] [description]');
    process.exit(1);
  }

  // Estado actual (para mostrar el antes/después y reusar label/description si no se pasan).
  const before = await medusaRequest<{ shipping_option: ShippingOption }>(
    `/admin/shipping-options/${id}?fields=id,name,type.code,type.label,type.description`,
  );
  const cur = before.shipping_option?.type || {};
  console.log(`Opción: ${before.shipping_option?.name} (${id})`);
  console.log(`  type ANTES:  code="${cur.code ?? ''}" label="${cur.label ?? ''}"`);

  const type = {
    code,
    label: label ?? cur.label ?? code,
    description: description ?? cur.description ?? '',
  };

  const after = await medusaRequest<{ shipping_option: ShippingOption }>(
    `/admin/shipping-options/${id}`,
    { method: 'POST', body: { type } },
  );
  const nt = after.shipping_option?.type || {};
  console.log(`  type DESPUÉS: code="${nt.code ?? ''}" label="${nt.label ?? ''}"`);
  console.log('Listo.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
