import './styles/index.css';
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import Index from './pages/index';
import { useTheme } from './hooks/useTheme';

const Summary = lazy(() => import('./pages/summary'));

/** One Helmet for all classic routes — avoids per-page stale `data-theme`. */
function ClassicRoutes() {
  const { theme } = useTheme();

  return (
    <>
      <Helmet>
        <html lang="en" data-theme={theme} />
      </Helmet>
      <BrowserRouter>
        {/* No visible fallback: a Loading... shell flashes the whole UI on navigate (#1139). */}
        <Suspense>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="*" element={<Index />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </>
  );
}

export default function ClassicTheme() {
  return (
    <HelmetProvider>
      <ClassicRoutes />
    </HelmetProvider>
  );
}
