import '../olas/olas.css';

export const metadata = {
  title: 'Faltantes',
};

export default function FaltantesLayout({ children }: { children: React.ReactNode }) {
  return <div className="olas-root">{children}</div>;
}
