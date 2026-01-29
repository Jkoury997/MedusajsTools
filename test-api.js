const MEDUSA_BACKEND_URL = 'https://backend.marcelakoury.com';
const MEDUSA_ADMIN_EMAIL = 'jorge_koury@icloud.com';
const MEDUSA_ADMIN_PASSWORD = 'eTk2DKS11xiADQopttckmfFhKZyRDFC9';

async function login() {
  console.time('Login');
  const response = await fetch(`${MEDUSA_BACKEND_URL}/auth/user/emailpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: MEDUSA_ADMIN_EMAIL, password: MEDUSA_ADMIN_PASSWORD }),
  });
  const data = await response.json();
  console.timeEnd('Login');
  return data.token;
}

async function testOptimizedQuery(token) {
  // Query optimizada - solo campos necesarios para listado
  console.time('Query optimizada');
  const response = await fetch(`${MEDUSA_BACKEND_URL}/admin/orders?limit=50&fields=+shipping_address.*,+customer.*,+items.quantity`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await response.json();
  console.timeEnd('Query optimizada');
  console.log('Pedidos:', data.orders?.length);
}

async function main() {
  const token = await login();
  await testOptimizedQuery(token);
}

main().catch(console.error);
