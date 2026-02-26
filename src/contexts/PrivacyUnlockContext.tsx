import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PRIVACY_MODE, PRIVACY_UNLOCK_SEQUENCE } from '@/utils/const';

const STORAGE_KEY = 'privacy_unlocked';

function getStored(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(STORAGE_KEY) === 'true';
}

const PrivacyUnlockContext = createContext<{
  isUnlocked: boolean;
  toggleUnlock: () => void;
}>({ isUnlocked: false, toggleUnlock: () => {} });

export function usePrivacyUnlock(): boolean {
  return useContext(PrivacyUnlockContext).isUnlocked;
}

export function usePrivacyUnlockToggle(): () => void {
  return useContext(PrivacyUnlockContext).toggleUnlock;
}

/** Normalize key for sequence match: Arrow keys as-is, letters lowercase */
function normalizeKey(e: KeyboardEvent): string | null {
  const k = e.key;
  if (
    k === 'ArrowUp' ||
    k === 'ArrowDown' ||
    k === 'ArrowLeft' ||
    k === 'ArrowRight'
  )
    return k;
  if (k.length === 1 && /^[a-zA-Z]$/.test(k)) return k.toLowerCase();
  return null;
}

export function PrivacyUnlockProvider({ children }: React.PropsWithChildren) {
  const [isUnlocked, setUnlocked] = useState(getStored);
  const bufferRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((value: boolean) => {
    setUnlocked(value);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    }
  }, []);

  useEffect(() => {
    if (!PRIVACY_MODE || !PRIVACY_UNLOCK_SEQUENCE.length) return;

    const sequence = PRIVACY_UNLOCK_SEQUENCE;
    const len = sequence.length;

    const resetBuffer = () => {
      bufferRef.current = [];
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e);
      if (key === null) return;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      bufferRef.current = [...bufferRef.current, key].slice(-len);
      if (
        bufferRef.current.length === len &&
        bufferRef.current.every((v, i) => v === sequence[i])
      ) {
        resetBuffer();
        persist(!getStored());
      } else {
        timeoutRef.current = setTimeout(resetBuffer, 2000);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [persist]);

  const toggleUnlock = useCallback(() => {
    if (!PRIVACY_MODE) return;
    persist(!getStored());
  }, [persist]);

  const value = React.useMemo(
    () => ({
      isUnlocked: PRIVACY_MODE ? isUnlocked : false,
      toggleUnlock,
    }),
    [isUnlocked, toggleUnlock]
  );

  return (
    <PrivacyUnlockContext.Provider value={value}>
      {children}
    </PrivacyUnlockContext.Provider>
  );
}
