import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../src/lib/utils';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn('h-4 w-4 rounded border border-input accent-primary', className)}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';
