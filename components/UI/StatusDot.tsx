import type React from 'react';

export type SystemStatus = 'online' | 'processing' | 'warning' | 'offline';

const STATUS_STYLES: Record<
  SystemStatus,
  { dot: string; text: string; glow: string; label: string; breathe: boolean }
> = {
  online: {
    dot: 'bg-accent-green',
    text: 'text-accent-green',
    glow: '',
    label: 'Online',
    breathe: false,
  },
  processing: {
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    glow: '',
    label: 'Processing',
    breathe: true,
  },
  warning: {
    dot: 'bg-accent-amber',
    text: 'text-accent-amber',
    glow: '',
    label: 'Warning',
    breathe: false,
  },
  offline: {
    dot: 'bg-accent-red',
    text: 'text-accent-red',
    glow: '',
    label: 'Offline',
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
      className={`inline-flex items-center gap-2 text-xs font-medium ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.breathe ? 'animate-breathe' : ''}`}
      />
      <span className={s.text}>{label || s.label}</span>
    </span>
  );
};

export default StatusDot;
