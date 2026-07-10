import { type ReactNode, type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../src/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function SelectTrigger({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative bg-popover text-popover-foreground rounded-md border shadow-md p-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectItem({
  className,
  children,
  value,
  ...props
}: {
  className?: string;
  children: ReactNode;
  value: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent',
        className,
      )}
      data-value={value}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectValue({
  children,
  placeholder,
}: { children?: ReactNode; placeholder?: string }) {
  return <span className="text-sm">{children ?? placeholder}</span>;
}
