import type { Metadata } from 'next';
import '../styles/globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Marquito — OpenLineage Visualizer',
  description: 'A simplified OpenLineage data lineage visualizer with table-level and column-level lineage.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header />
            <main style={{ flex: 1, paddingTop: '48px' }}>
              {children}
            </main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
