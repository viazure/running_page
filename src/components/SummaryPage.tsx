import ActivityList from '@/themes/classic/components/ActivityList';
import './SummaryPage.css';

interface SummaryPageProps {
  onBack?: () => void;
}

/**
 * Full classic Summary (year/month/week/day cards + Life SVG) for dashboard themes.
 */
export function SummaryPage({ onBack }: SummaryPageProps) {
  return (
    <div className="summary-page-root mx-auto min-h-[60vh] max-w-[1400px]">
      <ActivityList onBack={onBack} />
    </div>
  );
}
