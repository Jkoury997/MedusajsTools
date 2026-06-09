import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import HomeScreen from './HomeScreen';

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // La tienda no opera el depósito: va directo a su portal.
  if (session.role === 'store') redirect('/tienda');
  return <HomeScreen />;
}
