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
}> = ({ icon: Icon, label, value, sublabel, accent = 'cyan', loading, trend }) => {
  const theme =
    accent === 'none'
      ? null
      : {
          cyan: {
            text: 'text-accent-cyan',
            iconBg: 'bg-accent-cyan/10',
            iconRing: 'ring-accent-cyan/25',
            glow: 'shadow-glow-cyan',
            bar: 'bg-accent-cyan',
          },
          green: {
            text: 'text-accent-green',
            iconBg: 'bg-accent-green/10',
            iconRing: 'ring-accent-green/25',
            glow: 'shadow-glow-green',
            bar: 'bg-accent-green',
          },
          amber: {
            text: 'text-accent-amber',
            iconBg: 'bg-accent-amber/10',
            iconRing: 'ring-accent-amber/25',
            glow: 'shadow-glow-amber',
            bar: 'bg-accent-amber',
          },
          red: {
            text: 'text-accent-red',
            iconBg: 'bg-accent-red/10',
            iconRing: 'ring-accent-red/25',
            glow: 'shadow-glow-red',
            bar: 'bg-accent-red',
          },
        }[accent];

  return (
    <div className="group relative overflow-hidden rounded-md border border-console-border bg-console-surface-raised/60 bg-panel-sheen px-4 py-3.5 transition-all duration-200 hover:border-console-border-strong hover:bg-console-surface-raised">
      {/* top accent bar */}
      {theme && (
        <span
          className={`absolute inset-x-0 top-0 h-[2px] ${theme.bar} opacity-70`}
        />
      )}

      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-console-muted">
          {label}
        </span>
        {Icon && (
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ${
              theme ? `${theme.iconBg} ${theme.iconRing}` : 'bg-console-surface ring-console-border'
            }`}
          >
            <Icon size={13} className={theme ? theme.text : 'text-console-muted'} />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`font-mono text-[26px] font-semibold leading-none tabular-nums tracking-tight ${
            loading ? 'text-console-muted' : theme ? theme.text : 'text-console-text'
          }`}
        >
          {loading ? '—' : value}
        </span>
        {trend && !loading && (
          <span
            className={`font-mono text-[11px] ${
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
        <div className="mt-1 font-mono text-[11px] text-console-muted">{sublabel}</div>
      )}
    </div>
  );
};

export default HudMetric;
