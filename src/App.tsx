import {
  lazy,
  type LazyExoticComponent,
  type ComponentType,
  Suspense,
} from 'react';
import { LocaleProvider } from './hooks/useLocale';
import { THEME_PRESET } from './config';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageSkeleton } from './components/PageSkeleton';

type ThemeModule = { default: ComponentType };

const themeLoaders: Record<string, () => Promise<ThemeModule>> = {
  dashboard: () => import('./themes/dashboard'),
  dashboard_pro: () => import('./themes/dashboard_pro'),
  classic: () => import('./themes/classic'),
};

const themes: Record<string, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(themeLoaders.dashboard),
  dashboard_pro: lazy(themeLoaders.dashboard_pro),
  classic: lazy(themeLoaders.classic),
};

const preset = THEME_PRESET in themes ? THEME_PRESET : 'dashboard';
const ThemeComponent = themes[preset];

// Start downloading the active theme as soon as App module evaluates
void themeLoaders[preset]();

export default function App() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <ThemeComponent />
        </Suspense>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
