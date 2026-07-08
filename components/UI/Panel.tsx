import type React from 'react';

/**
 * Premium dark panel: hairline border, subtle top sheen, soft ambient
 * shadow for depth. Flat and technical, but not a flat wireframe box.
 */
export const Panel: React.FC<{
  title?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, eyebrow, right, className = '', bodyClassName = '', children }) => {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-console-border bg-console-surface ${className}`}
    >
      {(title || right) && (
        <div className="relative flex items-center justify-between border-b border-console-border/80 px-4 py-3">
          <div>
            {eyebrow && (
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-console-muted">
                {eyebrow}
              </div>
            )}
            {title && (
              <h3 className="mt-0.5 font-mono text-sm font-semibold tracking-tight text-console-text">
                {title}
              </h3>
            )}
          </div>
          {right}
        </div>
      )}
      <div className={bodyClassName || 'p-4'}>{children}</div>
    </div>
  );
};

export default Panel;
