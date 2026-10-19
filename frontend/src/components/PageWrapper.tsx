import { Navbar } from './Navbar';

interface Props {
  children: React.ReactNode;
}

export function PageWrapper({ children }: Props) {
  return (
    <div className="cv-page">
      <div className="cv-glow cv-glow--purple" />
      <div className="cv-glow cv-glow--cyan" />
      <Navbar />
      <main className="cv-main">
        {children}
      </main>
    </div>
  );
}
