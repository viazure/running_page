import { useCallback, useRef, useState, type MouseEvent } from 'react';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import { NAV_LINKS, navLinkLabel } from '../config';
import { usePrivacyUnlockToggle } from '../contexts/PrivacyUnlockContext';

type Page = 'home' | 'tracks';

interface HeaderProps {
  dark: boolean;
  toggleTheme: () => void;
  /** Unused by Header; kept optional for call-site compatibility */
  activities?: Activity[];
  page: Page;
  onNavigate: (p: Page) => void;
  /** Enable logo multi-tap privacy unlock (still navigates home on click) */
  enablePrivacyUnlock?: boolean;
}

const LOGO_TAP_TARGET = 7;
const LOGO_TAP_WINDOW_MS = 2000;

export function Header({
  dark,
  toggleTheme,
  page,
  onNavigate,
  enablePrivacyUnlock = false,
}: HeaderProps) {
  const { locale, setLocale, t } = useLocale();
  const toggleUnlock = usePrivacyUnlockToggle();
  const logoTapCountRef = useRef(0);
  const logoTapWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogoClick = useCallback(
    (e: MouseEvent) => {
      onNavigate('home');
      if (!enablePrivacyUnlock) return;
      logoTapCountRef.current += 1;
      if (logoTapCountRef.current >= LOGO_TAP_TARGET) {
        if (logoTapWindowRef.current) {
          clearTimeout(logoTapWindowRef.current);
          logoTapWindowRef.current = null;
        }
        logoTapCountRef.current = 0;
        e.preventDefault();
        toggleUnlock();
      } else if (logoTapCountRef.current === 1) {
        logoTapWindowRef.current = setTimeout(() => {
          logoTapCountRef.current = 0;
          logoTapWindowRef.current = null;
        }, LOGO_TAP_WINDOW_MS);
      }
    },
    [enablePrivacyUnlock, onNavigate, toggleUnlock]
  );

  const navItems: { label: string; page: Page }[] = [
    { label: t('home'), page: 'home' },
    { label: t('tracks'), page: 'tracks' },
  ];

  const handleNav = (p: Page) => {
    onNavigate(p);
    setMenuOpen(false);
  };

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-card)]"
    >
      {dark ? (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );

  const localeButton = (
    <button
      type="button"
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
      title={locale === 'zh' ? 'Switch to English' : '切换中文'}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-4 md:px-6">
        <button
          type="button"
          onClick={handleLogoClick}
          className="flex min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
          title={t('home')}
        >
          <span className="truncate text-xl font-bold text-[var(--color-text)]">
            RUNNING<span className="text-[var(--color-run)]">.</span>PAGE
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden items-center gap-5 md:flex">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`cursor-pointer border-0 bg-transparent p-0 text-sm transition-colors ${
                item.page === page
                  ? 'font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {item.label}
            </button>
          ))}
          {NAV_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {navLinkLabel(link, locale)}
            </a>
          ))}
          {themeButton}
          {localeButton}
        </div>

        {/* Mobile: theme + locale + menu toggle */}
        <div className="flex items-center gap-1 md:hidden">
          {themeButton}
          {localeButton}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <nav
          id="mobile-nav-menu"
          className="border-t border-[var(--color-border)] md:hidden"
        >
          <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-3">
            {navItems.map((item) => (
              <button
                type="button"
                key={item.page}
                onClick={() => handleNav(item.page)}
                className={`rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  item.page === page
                    ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
            {NAV_LINKS.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-text)]"
              >
                {navLinkLabel(link, locale)}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
