
import './styles.css';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
