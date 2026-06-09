import '../olas/olas.css';

export const metadata = {
  title: 'Portal de Tienda',
};

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return <div className="olas-root">{children}</div>;
}
