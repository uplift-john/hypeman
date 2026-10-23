import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent shadow-card hover:bg-accent-hover active:translate-y-px aria-disabled:bg-surface-2 aria-disabled:text-muted aria-disabled:shadow-none aria-disabled:cursor-not-allowed',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 active:translate-y-px aria-disabled:text-muted aria-disabled:cursor-not-allowed',
  ghost: 'text-ink hover:bg-surface-2 aria-disabled:text-muted',
  danger:
    'bg-surface text-danger border border-line hover:border-danger hover:bg-danger-soft active:translate-y-px',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-3 text-[15px] gap-1.5 rounded-xl sm:px-4 sm:gap-2',
  lg: 'h-14 px-6 text-[17px] gap-2.5 rounded-2xl',
  icon: 'h-11 w-11 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

/**
 * Buttons use aria-disabled (not disabled) when they should stay focusable and
 * explain themselves; clicks are suppressed by the caller in that case.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex select-none items-center justify-center font-semibold [&_svg]:shrink-0 transition-[background-color,border-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
});

export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'live'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent-ink border-transparent',
    live: 'bg-danger-soft text-danger border-transparent',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
