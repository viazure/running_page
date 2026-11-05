import './PageSkeleton.css';
import { THEME_PRESET } from '../config';

const isPro = THEME_PRESET === 'dashboard_pro';

/** Mist panel — no inner chrome. */
function Mist({ className }: { className: string }) {
  return <div className={`sk-mist ${className}`} aria-hidden />;
}

/**
 * Fog silhouette for dashboard_pro home.
 * Desktop: left + right columns only. Mobile: three soft bands.
 * Shorter than live content so hard-refresh does not jump up.
 */
function ProBodySkeleton() {
  return (
    <div className="sk-body">
      <div className="sk-left">
        <Mist className="sk-panel-primary" />
        <Mist className="sk-panel-secondary" />
      </div>
      <div className="sk-right">
        <Mist className="sk-panel-side" />
      </div>
    </div>
  );
}

/** Compact generic mist — still paints without theme Tailwind. */
function GenericBodySkeleton() {
  return (
    <div className="sk-gen-grid">
      <Mist className="sk-gen-primary" />
      <Mist className="sk-gen-side" />
    </div>
  );
}

function ProHeader() {
  return (
    <header className="sk-header">
      <div className="sk-header-inner">
        <span className="sk-logo">
          RUNNING<span className="sk-logo-dot">.</span>PAGE
        </span>
        <div className="sk-header-mist" aria-hidden />
      </div>
    </header>
  );
}

/** Full-page shell while theme chunk loads (main-bundle CSS). */
export function PageSkeleton() {
  if (isPro) {
    return (
      <div className="sk-page">
        <ProHeader />
        <main className="sk-main">
          <ProBodySkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="sk-gen-page">
      <header className="sk-gen-header">
        <div className="sk-gen-header-inner">
          <div className="sk-gen-brand sk-mist" aria-hidden />
          <div className="sk-header-mist" aria-hidden />
        </div>
      </header>
      <main className="sk-gen-main">
        <GenericBodySkeleton />
      </main>
    </div>
  );
}

/**
 * Content-area only (real Header already mounted).
 * Only dashboard_pro uses this; always the pro body.
 */
export function DashboardContentSkeleton() {
  return (
    <main className="sk-main">
      <ProBodySkeleton />
    </main>
  );
}
