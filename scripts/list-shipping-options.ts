/**
 * Lista las shipping options de Medusa (id estable `so_...` + nombre) para
 * armar el mapa de prioridad de olas.
 *
 * Uso:
 *   npx tsx scripts/list-shipping-options.ts
 *   (requiere MEDUSA_BACKEND_URL y MEDUSA_SECRET_API_KEY en .env.local o el env)
 *
 * Imprime una tabla id → nombre → type.code y, al final, un esqueleto JSON
 * listo para pegar en la variable de entorno SHIPPING_OPTION_GROUPS.
 * Editá el grupo de cada opción según corresponda. Grupos válidos:
 *   express | mercado_libre | store_pickup | correo | via_cargo |
 *   expreso_cliente | factory_pickup | other
 */
import { existsSync } from 'node:fs';
// tsx no carga .env.local solo (a diferencia de Next.js).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

import { medusaRequest } from '../src/lib/medusa';

interface ShippingOption {
  id: string;
  name: string;
  type?: { code?: string; label?: string } | null;
}

async function main() {
  const data = await medusaRequest<{ shipping_options: ShippingOption[] }>(
    '/admin/shipping-options?limit=200&fields=id,name,type.code,type.label',
  );

  const options = data.shipping_options || [];
  if (options.length === 0) {
    console.log('No se encontraron shipping options.');
    return;
  }

  console.log(`\n${options.length} shipping options:\n`);
  for (const o of options) {
    console.log(`  ${o.id}   ${o.name}${o.type?.code ? `   [type: ${o.type.code}]` : ''}`);
  }

  // El mapeo de olas va por type.code (default incorporado en wave.ts). Solo
  // necesitás esta env para codes nuevos o para pisar el default.
  const codes = [...new Set(options.map((o) => o.type?.code).filter(Boolean))];
  const skeleton = Object.fromEntries(codes.map((c) => [c as string, 'other']));
  console.log('\nLas olas mapean por type.code (default en wave.ts). Override opcional por env:\n');
  console.log(`SHIPPING_TYPE_GROUPS='${JSON.stringify(skeleton)}'\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
