import type React from 'react';

/**
 * Sharp, borderless-feeling container: thin 1px hairline border, flat
 * charcoal surface, no rounded-3xl / gradient / shadow bloom. This is the
 * base building block for the command-center design system.
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
      className={`bg-console-surface border border-console-border rounded-sm ${className}`}
    >
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-console-border px-4 py-2.5">
          <div>
            {eyebrow && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-console-muted">
                {eyebrow}
              </div>
            )}
            {title && (
              <h3 className="font-mono text-sm font-medium text-console-text">
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
