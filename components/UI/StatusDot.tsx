import type React from 'react';

export type SystemStatus = 'online' | 'processing' | 'warning' | 'offline';

const STATUS_STYLES: Record<
  SystemStatus,
  { dot: string; text: string; glow: string; label: string; breathe: boolean }
> = {
  online: {
    dot: 'bg-accent-green',
    text: 'text-accent-green',
    glow: 'shadow-[0_0_8px_rgba(57,255,136,0.7)]',
    label: 'ONLINE',
    breathe: false,
  },
  processing: {
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    glow: 'shadow-[0_0_8px_rgba(245,185,66,0.7)]',
    label: 'PROCESSING',
    breathe: true,
  },
  warning: {
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    glow: 'shadow-[0_0_8px_rgba(245,185,66,0.7)]',
    label: 'WARNING',
    breathe: false,
  },
  offline: {
    dot: 'bg-accent-red',
    text: 'text-accent-red',
    glow: 'shadow-[0_0_8px_rgba(255,77,94,0.7)]',
    label: 'OFFLINE',
    breathe: false,
  },
};

/**
 * Solid status indicator with a soft glow instead of a bounce/spin --
 * "processing" gets a slow, subtle breathing glow (not a spinner), every
 * other state is a static, instantaneous dot.
 */
export const StatusDot: React.FC<{
  status: SystemStatus;
  label?: string;
  className?: string;
}> = ({ status, label, className = '' }) => {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs tracking-wide ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.glow} ${s.breathe ? 'animate-breathe' : ''}`}
      />
      <span className={s.text}>{label || s.label}</span>
    </span>
  );
};

export default StatusDot;
