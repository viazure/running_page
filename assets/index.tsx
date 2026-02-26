const yearStats = import.meta.glob('./year_*.svg', { import: 'ReactComponent' });
const yearSummaryStats = import.meta.glob('./year_summary_*.svg', {
  import: 'ReactComponent',
});
const githubYearStats = import.meta.glob('./github_*.svg', {
  import: 'ReactComponent',
});
const totalStat = import.meta.glob(
  ['./github.svg', './grid.svg', './mol.svg'],
  { import: 'ReactComponent' }
);

export { yearStats, yearSummaryStats, githubYearStats, totalStat };
