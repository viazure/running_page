import { PRIVACY_MODE, PRIVACY_UNLOCK } from './config';

export { PRIVACY_MODE, PRIVACY_UNLOCK };

/** True when privacy is on and temporary unlock triggers are allowed */
export const CAN_PRIVACY_UNLOCK: boolean = PRIVACY_MODE && PRIVACY_UNLOCK;

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
