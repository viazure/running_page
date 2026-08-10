import ActivityList from '@/themes/classic/components/ActivityList';
import './SummaryPage.css';

interface SummaryPageProps {
  onBack?: () => void;
}

/**
 * Dashboard-theme Summary shell around classic ActivityList.
 * Visual/interaction overrides live in SummaryPage.css + `embedded` prop —
 * classic `/summary` is left unchanged.
 */
export function SummaryPage({ onBack }: SummaryPageProps) {
  return (
    <div className="summary-page-root mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-hidden px-4 pt-4 md:px-6 md:pt-6">
      <ActivityList onBack={onBack} embedded />
    </div>
  );
}
