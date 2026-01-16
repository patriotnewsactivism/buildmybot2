import type { LucideIcon } from 'lucide-react';
import type React from 'react';

interface PlayfulMetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  gradient: string;
  trend?: string;
  illustration?: string; // emoji or icon
  onClick?: () => void;
  loading?: boolean;
}

export const PlayfulMetricCard: React.FC<PlayfulMetricCardProps> = ({
  icon: Icon,
  label,
  value,
  gradient,
  trend,
  illustration,
  onClick,
  loading = false,
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-6
        bg-gradient-to-br ${gradient} shadow-xl hover:shadow-2xl
        hover:scale-105 transition-all duration-300
        ${onClick ? 'cursor-pointer' : ''} group`}
      onClick={onClick}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white blur-2xl animate-pulse" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {illustration && (
          <div className="text-5xl mb-2 group-hover:animate-bounce">
            {illustration}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <Icon className="text-white/90" size={28} />
          {trend && (
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-sm font-bold backdrop-blur-sm">
              {trend}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 bg-white/20 rounded animate-pulse" />
            <div className="h-4 bg-white/20 rounded animate-pulse w-2/3" />
          </div>
        ) : (
          <>
            <div className="text-4xl font-black text-white mb-1">
              {value}
            </div>
            <div className="text-white/90 font-semibold text-sm uppercase tracking-wide">
              {label}
            </div>
          </>
        )}
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent" />
      </div>
    </div>
  );
};
