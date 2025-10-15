
import './styles.css';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';
import PageFade from '@/components/PageFade';
import SidebarNav from '@/components/SidebarNav';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="app-shell">
            <SidebarNav />
            <div className="app-shell__content">
              <PageFade>{children}</PageFade>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
