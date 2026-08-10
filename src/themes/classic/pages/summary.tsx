import { useEffect } from 'react';
import ActivityList from '../components/ActivityList';
import { initSvgColorAdjustments } from '../utils/colorUtils';

/** Classic summary: ActivityList only — no site Layout/Header (upstream-style). */
const SummaryPage = () => {
  useEffect(() => {
    const timer = setTimeout(() => initSvgColorAdjustments(), 100);
    return () => clearTimeout(timer);
  }, []);

  return <ActivityList />;
};

export default SummaryPage;
