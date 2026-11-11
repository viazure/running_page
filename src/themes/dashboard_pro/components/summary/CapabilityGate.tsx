import type { ReactNode } from 'react';
import {
  gate,
  type Capabilities,
  type CapabilityKey,
  type GateMode,
} from '../../summary/capabilities';

/**
 * Renders children only when the data behind them exists.
 *
 * A public deployment with GPX-only data must not show empty chart shells, so
 * the default is to render nothing at all. Pass `insufficientNote` to show a
 * quiet one-liner when there is some data but too little to chart.
 */
export function CapabilityGate({
  capabilities,
  need,
  mode = 'all',
  children,
  insufficientNote,
  label,
}: {
  capabilities: Capabilities | null;
  need: CapabilityKey | CapabilityKey[];
  /** `any` for composite cards whose series render independently. */
  mode?: GateMode;
  children: ReactNode;
  /** Shown when coverage is below the charting threshold. */
  insufficientNote?: ReactNode;
  /** Optional heading kept visible while insufficient (tests/debug aid). */
  label?: string;
}) {
  const result = gate(capabilities, need, mode);
  if (result === 'hide') return null;
  if (result === 'insufficient') {
    if (!insufficientNote) return null;
    return (
      <div className="progress-q card" data-capability-gate={label ?? ''}>
        <p className="progress-empty">{insufficientNote}</p>
      </div>
    );
  }
  return <>{children}</>;
}
