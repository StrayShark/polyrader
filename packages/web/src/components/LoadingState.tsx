import BounceLoader from 'react-spinners/BounceLoader';
import { cn } from '../utils/cn';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

interface LoadingStateProps extends LoadingSpinnerProps {
  label?: string;
  textClassName?: string;
}

export function LoadingSpinner({ size = 32, className }: LoadingSpinnerProps) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden="true">
      <BounceLoader color="var(--primary)" size={size} speedMultiplier={0.9} />
    </span>
  );
}

export function LoadingState({ size = 32, label, className, textClassName }: LoadingStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2', className)}
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
    >
      <LoadingSpinner size={size} />
      {label && <span className={cn('text-sm text-muted-foreground', textClassName)}>{label}</span>}
    </div>
  );
}
