'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const primaryLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '#', label: 'Placeholder' },
  { href: '#', label: 'Placeholder' },
  { href: '#', label: 'Placeholder' },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Link href="/" className="sidebar__brand-link">
          genius
        </Link>
      </div>
      <nav className="sidebar__nav" aria-label="Main navigation">
        <ul className="sidebar__list">
          {primaryLinks.map(({ href, label }) => {
            const isDashboard = href === '/';
            const isActive = isDashboard
              ? pathname === '/' || pathname.startsWith('/deck')
              : href !== '#'
                ? pathname === href
                : false;

            const className = [
              'sidebar__link',
              isActive ? 'sidebar__link--active' : null,
              href === '#' ? 'sidebar__link--placeholder' : null,
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <li key={label} className="sidebar__item">
                <Link href={href} className={className} aria-current={isActive ? 'page' : undefined}>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="sidebar__footer">
        <Link href="#" className="sidebar__link sidebar__link--muted">
          Settings
        </Link>
      </div>
    </aside>
  );
}
