import type { LucideIcon } from 'lucide-react';
import type React from 'react';

/**
 * Premium HUD metric tile: soft ambient glow behind the icon, gradient
 * numeral, hairline border that lights up on the accent color. One accent
 * per tile -- no rainbow, no per-item hues.
 */
export const HudMetric: React.FC<{
  icon?: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: 'cyan' | 'green' | 'amber' | 'red' | 'none';
  loading?: boolean;
  trend?: { value: string; direction: 'up' | 'down' | 'flat' };
}> = ({
  icon: Icon,
  label,
  value,
  sublabel,
  accent = 'cyan',
  loading,
  trend,
}) => {
  const theme =
    accent === 'none'
      ? null
      : {
          cyan: {
            text: 'text-accent-cyan',
            iconBg: 'bg-console-surface',
            bar: 'bg-accent-cyan',
          },
          green: {
            text: 'text-accent-green',
            iconBg: 'bg-console-surface',
            bar: 'bg-accent-green',
          },
          amber: {
            text: 'text-accent-amber',
            iconBg: 'bg-console-surface',
            bar: 'bg-accent-amber',
          },
          red: {
            text: 'text-accent-red',
            iconBg: 'bg-console-surface',
            bar: 'bg-accent-red',
          },
        }[accent];

  return (
    <div className="relative overflow-hidden rounded-md border border-console-border bg-console-surface-raised/40 px-3 py-3 transition-colors duration-150 hover:border-console-border-strong sm:px-4 sm:py-3.5">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-console-muted">
          {label}
        </span>
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-console-border bg-console-surface">
            <Icon
              size={12}
              className={theme ? theme.text : 'text-console-muted'}
            />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-xl font-semibold leading-none tabular-nums tracking-tight sm:text-2xl ${
            loading ? 'text-console-muted' : 'text-console-text'
          }`}
        >
          {loading ? '—' : value}
        </span>
        {trend && !loading && (
          <span
            className={`text-[11px] font-medium ${
              trend.direction === 'up'
                ? 'text-accent-green'
                : trend.direction === 'down'
                  ? 'text-accent-red'
                  : 'text-console-muted'
            }`}
          >
            {trend.direction === 'up'
              ? '▲'
              : trend.direction === 'down'
                ? '▼'
                : '–'}{' '}
            {trend.value}
          </span>
        )}
      </div>
      {sublabel && (
        <div className="mt-1 text-[11px] text-console-muted">{sublabel}</div>
      )}
    </div>
  );
};

export default HudMetric;
