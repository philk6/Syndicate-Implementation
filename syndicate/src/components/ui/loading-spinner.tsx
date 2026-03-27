import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-10 h-10 border-[3px]',
  };

  return (
    <div
      className={cn(
        'rounded-full animate-spin border-amber-500/20 border-t-amber-500',
        sizeClasses[size],
        className,
      )}
    />
  );
}

/**
 * A full-page centered loading spinner.
 * Use this as a drop-in replacement for page-level loading states.
 */
export function PageLoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
