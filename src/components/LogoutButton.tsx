'use client';

import { signOut } from 'next-auth/react';
import { useTransition } from 'react';

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className }: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      signOut({ callbackUrl: '/login' });
    });
  };

  const classes = ['chip', className].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={handleClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
