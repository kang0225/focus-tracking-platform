'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface NavbarProps {
  user?: { name: string; avatarUrl?: string | null } | null;
  showSignIn?: boolean;
}

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/tracker', label: 'Apple Watch' },
];

export default function Navbar({ user, showSignIn = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        borderBottom: '1px solid var(--color-border)',
        boxShadow: '0 1px 0 rgba(15, 23, 42, 0.04)',
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-3 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-[1.02]">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'var(--color-brand-500)', boxShadow: 'var(--shadow-brand)' }}>
            <i className="ti ti-target text-base text-white" aria-hidden="true" />
          </div>
          <span className="text-base font-semibold" style={{ color: 'var(--color-brand-900)' }}>FocusTracking</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? 'ft-nav-link ft-nav-link-active' : 'ft-nav-link'}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showSignIn && !user && (
            <Link href="/login" className="ft-btn-primary text-sm">
              <i className="ti ti-login text-sm" aria-hidden="true" />
              시작하기
            </Link>
          )}
          {user && (
            <>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-9 w-9 rounded-full object-cover"
                  style={{ background: 'var(--color-brand-100)', boxShadow: 'var(--shadow-sm)' }}
                />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: 'var(--color-brand-100)', color: 'var(--color-brand-700)', boxShadow: 'var(--shadow-sm)' }}
                >
                  {user.name?.[0] ?? '?'}
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  router.push('/');
                  router.refresh();
                }}
                className="ft-btn-ghost text-xs"
                aria-label="로그아웃"
              >
                <i className="ti ti-logout text-base" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
