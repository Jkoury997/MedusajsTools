import './olas.css';

export const metadata = {
  title: 'Picking por Olas',
};

export default function OlasLayout({ children }: { children: React.ReactNode }) {
  return <div className="olas-root">{children}</div>;
}
