import type React from 'react';

export type SystemStatus = 'online' | 'processing' | 'warning' | 'offline';

const STATUS_STYLES: Record<
  SystemStatus,
  { dot: string; text: string; label: string }
> = {
  online: { dot: 'bg-accent-green', text: 'text-accent-green', label: 'ONLINE' },
  processing: {
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    label: 'PROCESSING',
  },
  warning: { dot: 'bg-accent-amber', text: 'text-accent-amber', label: 'WARNING' },
  offline: { dot: 'bg-accent-red', text: 'text-accent-red', label: 'OFFLINE' },
};

/**
 * Solid, static status indicator -- no spin/bounce/pulse. Matches the
 * "static precision" design rule: instantaneous state, not an animated one.
 */
export const StatusDot: React.FC<{
  status: SystemStatus;
  label?: string;
  className?: string;
}> = ({ status, label, className = '' }) => {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs tracking-wide ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className={s.text}>{label || s.label}</span>
    </span>
  );
};

export default StatusDot;
