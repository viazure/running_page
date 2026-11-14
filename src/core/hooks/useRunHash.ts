import { useSyncExternalStore } from 'react';
import {
  RUN_HASH_CHANGE_EVENT,
  readRunHash,
  type RunHash,
} from '../runHash.ts';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(RUN_HASH_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(RUN_HASH_CHANGE_EVENT, onStoreChange);
  };
}

export function useRunHash(): RunHash | null {
  return useSyncExternalStore(subscribe, readRunHash, () => null);
}
