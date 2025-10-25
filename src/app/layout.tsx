import "./globals.css";

import './styles.css';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';
import PageFade from '@/components/PageFade';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="app-centered">
            <PageFade>{children}</PageFade>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
