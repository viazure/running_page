import { useState, useEffect, useCallback } from 'react';
import {
  MAP_TILE_STYLE_LIGHT,
  MAP_TILE_STYLE_DARK,
  PRIVACY_MODE,
} from '@/utils/const';
import { usePrivacyUnlock } from '@/contexts/PrivacyUnlockContext';

export type Theme = 'light' | 'dark';

// Custom event name for theme changes
export const THEME_CHANGE_EVENT = 'theme-change';

/**
 * Converts a theme value to the corresponding map style
 * @param theme - The current theme ('light' or 'dark')
 * @returns The appropriate map style for the theme
 */
export const getMapThemeFromCurrentTheme = (theme: Theme): string => {
  if (theme === 'dark') return MAP_TILE_STYLE_DARK;
  return MAP_TILE_STYLE_LIGHT;
};

/**
 * Hook for managing map theme based on application theme
 * @returns The current map theme style
 */
export const useMapTheme = () => {
  // Initialize map theme based on current settings, default to dark
  const [mapTheme, setMapTheme] = useState(() => {
    if (typeof window === 'undefined') return MAP_TILE_STYLE_DARK;

    // Check for explicit theme in DOM
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'dark') return MAP_TILE_STYLE_DARK;
    if (dataTheme === 'light') return MAP_TILE_STYLE_LIGHT;

    // Check for saved theme in localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') return MAP_TILE_STYLE_DARK;
    if (savedTheme === 'light') return MAP_TILE_STYLE_LIGHT;

    // Default to dark theme
    return MAP_TILE_STYLE_DARK;
  });

  /**
   * Ensures map theme is consistent with application theme
   */
  const ensureThemeConsistency = useCallback(() => {
    if (typeof window === 'undefined') return;

    const dataTheme = document.documentElement.getAttribute('data-theme');
    const savedTheme = localStorage.getItem('theme');

    let newTheme;

    // Determine the correct theme based on priority:
    // 1. Explicit DOM attribute
    // 2. localStorage setting
    // 3. Default to dark theme
    if (dataTheme === 'dark') {
      newTheme = MAP_TILE_STYLE_DARK;
    } else if (dataTheme === 'light') {
      newTheme = MAP_TILE_STYLE_LIGHT;
    } else if (!dataTheme && savedTheme === 'dark') {
      newTheme = MAP_TILE_STYLE_DARK;
    } else if (!dataTheme && savedTheme === 'light') {
      newTheme = MAP_TILE_STYLE_LIGHT;
    } else {
      // Default to dark theme
      newTheme = MAP_TILE_STYLE_DARK;
    }

    // Only update if theme has changed
    if (mapTheme !== newTheme) {
      setMapTheme(newTheme);
    }
  }, [mapTheme]);

  // Set up listeners for various theme change events
  useEffect(() => {
    // Watch for DOM attribute changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          ensureThemeConsistency();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Listen for custom theme change events
    const handleThemeChange = () => ensureThemeConsistency();
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    // Listen for localStorage changes (for multi-tab support)
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        handleThemeChange();
      }
    });

    // Initial check
    ensureThemeConsistency();

    // Clean up all listeners
    return () => {
      observer.disconnect();
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, [ensureThemeConsistency]);

  return mapTheme;
};

/**
 * Main theme hook for the application
 * @returns Object with current theme and function to change theme
 */
export const useTheme = () => {
  const isUnlocked = usePrivacyUnlock();
  // When privacy mode and not unlocked, force dark; otherwise from localStorage
  const effectivePrivacy = PRIVACY_MODE && !isUnlocked;

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    if (effectivePrivacy) return 'dark';
    return (localStorage.getItem('theme') as Theme) || 'dark';
  });

  /**
   * Set theme and dispatch event to notify other components.
   * No-op when privacy is effective (theme forced to dark).
   */
  const setTheme = useCallback((newTheme: Theme) => {
    if (effectivePrivacy) return;
    setThemeState(newTheme);
    const event = new CustomEvent(THEME_CHANGE_EVENT, {
      detail: { theme: newTheme },
    });
    window.dispatchEvent(event);
  }, [effectivePrivacy]);

  // Apply theme changes to DOM and localStorage; when effective privacy always enforce dark
  useEffect(() => {
    const root = window.document.documentElement;
    const effectiveTheme = effectivePrivacy ? 'dark' : theme;
    root.setAttribute('data-theme', effectiveTheme);
    localStorage.setItem('theme', effectiveTheme);
    if (effectivePrivacy && theme !== 'dark') setThemeState('dark');
  }, [theme, effectivePrivacy]);

  // When user unlocks, restore theme from localStorage
  useEffect(() => {
    if (!effectivePrivacy && typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme | null;
      if (saved === 'dark' || saved === 'light') setThemeState(saved);
    }
  }, [effectivePrivacy]);

  return {
    theme: effectivePrivacy ? 'dark' : theme,
    setTheme,
  };
};

/**
 * Hook to trigger re-render when theme changes for dynamic color calculations
 * @returns A counter that increments when theme changes
 */
export const useThemeChangeCounter = () => {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const handleThemeChange = () => {
      setCounter((prev) => prev + 1);
    };

    // Listen for DOM attribute changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Listen for custom theme change events
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    // Listen for localStorage changes (for multi-tab support)
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        handleThemeChange();
      }
    });

    return () => {
      observer.disconnect();
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  return counter;
};
