'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

const LINKS = [
  { href: '/', label: 'Overview', active: (p) => p === '/' },
  { href: '/#how', label: 'How it works', active: () => false },
  { href: '/dashboard', label: 'Dashboard', active: (p) => p.startsWith('/dashboard') || p.startsWith('/products') },
];

const REPO_URL = 'https://github.com/dhruvguptadev/THE-PRICE-TRACK-ASSIGN';

export default function NavBar() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" onClick={close} className="flex items-center gap-2.5">
          <Logo className="h-8 w-8 rounded-lg shadow-sm shadow-accent/30" />
          <span className="leading-tight">
            <span className="block text-[0.95rem] font-semibold tracking-tight">Nightwatch</span>
            <span className="block text-[11px] text-muted">INE mock storefront</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-surface-2 p-1 ring-1 ring-line md:flex">
          {LINKS.map((l) => {
            const active = l.active(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Source code on GitHub"
            className="hidden h-9 w-9 place-items-center rounded-lg text-ink-2 ring-1 ring-line transition-colors hover:bg-surface-2 hover:text-ink sm:grid"
          >
            <GitHubIcon />
          </a>
          <Link
            href="/dashboard"
            onClick={close}
            className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong sm:inline-block"
          >
            Track a product
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink ring-1 ring-line hover:bg-surface-2 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden">
          <ul className="space-y-1">
            {LINKS.map((l) => {
              const active = l.active(pathname);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-2.5 text-sm ${active ? 'bg-accent-soft font-medium text-accent-strong' : 'text-ink-2 hover:bg-surface-2'}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2">
                <GitHubIcon /> Source on GitHub
              </a>
            </li>
          </ul>
          <Link
            href="/dashboard"
            onClick={close}
            className="mt-3 block rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-ink hover:bg-accent-strong"
          >
            Track a product
          </Link>
        </nav>
      )}
    </header>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
