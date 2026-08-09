import { PRIVACY_MODE } from './config';

export { PRIVACY_MODE };

/** Contra code: ↑↑↓↓←→←→BA BA. Empty = disabled. */
export const PRIVACY_UNLOCK_SEQUENCE: string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
  'b',
  'a',
];
