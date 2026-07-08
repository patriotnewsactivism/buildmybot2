import type { LucideIcon } from 'lucide-react';
import type React from 'react';

/**
 * High-density HUD metric tile: mono numerals, thin border, single accent
 * color used purposefully (not a rainbow per-tile). Replaces the old
 * rounded/gradient/bounce MetricCard + PlayfulMetricCard style.
 */
export const HudMetric: React.FC<{
  icon?: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: 'cyan' | 'green' | 'amber' | 'red' | 'none';
  loading?: boolean;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
}> = ({ icon: Icon, label, value, sublabel, accent = 'cyan', loading, trend }) => {
  const accentBorder =
    accent === 'none'
      ? ''
      : {
          cyan: 'border-l-accent-cyan',
          green: 'border-l-accent-green',
          amber: 'border-l-accent-amber',
          red: 'border-l-accent-red',
        }[accent];
  const accentText =
    accent === 'none'
      ? 'text-console-text'
      : {
          cyan: 'text-accent-cyan',
          green: 'text-accent-green',
          amber: 'text-accent-amber',
          red: 'text-accent-red',
        }[accent];

  return (
    <div
      className={`bg-console-surface border border-console-border ${
        accent !== 'none' ? `border-l-2 ${accentBorder}` : ''
      } rounded-sm px-4 py-3`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-console-muted">
          {label}
        </span>
        {Icon && <Icon size={14} className="text-console-muted" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={`font-mono text-2xl font-semibold tabular-nums ${
            loading ? 'text-console-muted' : accentText
          }`}
        >
          {loading ? '—' : value}
        </span>
        {trend && !loading && (
          <span
            className={`font-mono text-xs ${
              trend.direction === 'up'
                ? 'text-accent-green'
                : trend.direction === 'down'
                  ? 'text-accent-red'
                  : 'text-console-muted'
            }`}
          >
            {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '–'}{' '}
            {trend.value}
          </span>
        )}
      </div>
      {sublabel && (
        <div className="mt-0.5 font-mono text-[11px] text-console-muted">
          {sublabel}
        </div>
      )}
    </div>
  );
};

export default HudMetric;
