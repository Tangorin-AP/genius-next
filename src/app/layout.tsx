
import './styles.css';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';
import PageFade from '@/components/PageFade';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <PageFade>{children}</PageFade>
        </ThemeProvider>
      </body>
    </html>
  );
}
