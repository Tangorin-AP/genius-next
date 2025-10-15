'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export default function PageFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
