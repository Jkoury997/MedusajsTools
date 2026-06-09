import { getSession } from '@/lib/session';
import HomeScreen from './HomeScreen';
import LandingChooser from './LandingChooser';

const DEPOSITO_ROLES = ['picker', 'ecommerce', 'admin'];

export default async function HomePage() {
  const session = await getSession();
  // Usuario de depósito ya logueado → su home directo.
  if (session && DEPOSITO_ROLES.includes(session.role)) {
    return <HomeScreen />;
  }
  // Sin sesión, o sesión de tienda: dejar elegir Tienda o Depósito (Pickeo).
  return <LandingChooser />;
}
