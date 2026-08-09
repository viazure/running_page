import ActivityList from '@/themes/classic/components/ActivityList';
import './SummaryPage.css';

interface SummaryPageProps {
  onBack?: () => void;
}

/**
 * Full classic Summary (year/month/week/day cards + Life SVG) for dashboard themes.
 * Fills the remaining viewport under the header; only the card list scrolls.
 */
export function SummaryPage({ onBack }: SummaryPageProps) {
  return (
    <div className="summary-page-root mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-hidden px-4 pt-4 md:px-6 md:pt-6">
      <ActivityList onBack={onBack} />
    </div>
  );
}
