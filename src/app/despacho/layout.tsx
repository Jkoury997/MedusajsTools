import '../olas/olas.css';

export const metadata = {
  title: 'Despachos',
};

export default function DespachoLayout({ children }: { children: React.ReactNode }) {
  return <div className="olas-root">{children}</div>;
}
