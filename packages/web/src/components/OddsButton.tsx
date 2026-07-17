import { cn } from '../utils/cn';
import { oddsToImpliedProbability, formatProbability, formatOdds, formatOddsByFormat, type OddsFormat } from '../utils/bet-math';

interface OddsButtonProps {
  odds: number;
  selection: string;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  displayFormat?: OddsFormat;
  onClick?: () => void;
}

export function OddsButton({
  odds,
  selection,
  selected = false,
  disabled = false,
  className,
  displayFormat = 'decimal',
  onClick,
}: OddsButtonProps) {
  const implied = oddsToImpliedProbability(odds);
  const mainValue = formatOddsByFormat(odds, displayFormat);
  const subValue = displayFormat === 'decimal' ? formatProbability(implied) : formatOdds(odds);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-12 w-[110px] flex-col items-center justify-center rounded-lg border text-sm transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:bg-accent/50',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      aria-pressed={selected}
      aria-label={`${selection} ${mainValue}`}
    >
      <span className="font-semibold tabular-nums leading-none">{mainValue}</span>
      <span className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
        {subValue}
      </span>
    </button>
  );
}
