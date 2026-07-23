import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

export type ProductMode = 'read-only';

const MODE_META: Record<ProductMode, { icon: typeof Eye; badge: 'default' }> = {
  'read-only': { icon: Eye, badge: 'default' },
};

interface ProductModeNoticeProps {
  mode: ProductMode;
  className?: string;
}

/** Marks the external account surface that is intentionally read-only. */
export function ProductModeNotice({ mode, className }: ProductModeNoticeProps) {
  const { t } = useI18n();
  const meta = MODE_META[mode];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border border-border bg-muted/30 px-4 py-3',
        className,
      )}
      role="note"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.badge}>{t(`productMode.${mode}.badge`)}</Badge>
          <span className="text-sm font-medium">{t(`productMode.${mode}.title`)}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t(`productMode.${mode}.desc`)}</p>
      </div>
    </div>
  );
}
