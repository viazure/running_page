import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const reactRecommended = eslintReact.configs['recommended-typescript'];
const reactRulesAsWarnings = Object.fromEntries(
  Object.entries(reactRecommended.rules).map(([rule, config]) => {
    if (Array.isArray(config)) {
      return [rule, ['warn', ...config.slice(1)]];
    }
    return [rule, 'warn'];
  })
);

export default [
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/pyproject.toml',
      '**/LICENSE',
      '**/*lock.*',
      '**/*.html',
      '**/*.md',
      '**/*.css',
      '**/*.svg',
      '**/*.png',
      '**/*.jpg',
      '**/*.ico',
      '**/*.lock',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      ...reactRecommended.plugins,
      ...reactHooks.configs.flat.recommended.plugins,
      '@typescript-eslint': tsPlugin,
    },
    settings: reactRecommended.settings,
    rules: {
      ...reactRulesAsWarnings,
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  /*
   * ── Deliberate rule exemptions ──────────────────────────────────────────
   *
   * The three rules below were the whole remaining warning backlog (104). Every
   * hit was reviewed individually before turning the rule off; none of them
   * pointed at a real defect. They are disabled with the reason recorded here
   * rather than left as permanent noise, which is what made the previous 116
   * warnings impossible to scan for the ones that mattered.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      /*
       * Fires on any setState inside an effect. In this codebase those are:
       *   - hydrating from a module-level fetch cache (useSummaryAggregates,
       *     useActivitiesWithTracks) — the value is known synchronously, so
       *     deferring it to a microtask only adds a loading flash;
       *   - mirroring an external mutable source (matchMedia in
       *     useMobileMapDock, mapbox `mapStatus` in RouteMap/TracksPage);
       *   - moving several atoms at once for a layout handoff (setHoldSpacer +
       *     setPinMotion + setExpanded in useMobileMapDock) — splitting them
       *     makes the map blank between paints.
       * The rule assumes state can be derived during render, which does not hold
       * for any of the above. Rewriting them onto useSyncExternalStore is a
       * multi-day refactor of the map/dock state model, well outside this chore.
       */
      '@eslint-react/set-state-in-effect': 'off',
      'react-hooks/set-state-in-effect': 'off',

      /*
       * Fires on `key={index}`. Current hits are fixed-length, order-stable
       * arrays (12 calendar months, 3-4 hero stat tiles, per-day grid cells)
       * where the index IS the identity; a label-derived key would collide
       * across years of the same month.
       */
      '@eslint-react/no-array-index-key': 'off',
    },
  },
  {
    /*
     * Map surfaces only. These effects own an imperative mapbox instance:
     * adding `style`, `useBlank`, `startOrbitIfNeeded`, `withPolyline` etc. to
     * the dependency arrays tears down and rebuilds the map on every render.
     * The arrays are intentionally partial; each site carries a comment.
     */
    files: [
      'src/themes/dashboard_pro/components/RouteMap.tsx',
      'src/themes/dashboard_pro/components/TracksPage.tsx',
    ],
    rules: {
      '@eslint-react/exhaustive-deps': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
