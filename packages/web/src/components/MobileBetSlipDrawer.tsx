import { useState } from 'react';
import { Ticket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui';
import { PracticeBetSlip } from './PracticeBetSlip';
import { usePracticeSlipStore } from '../stores/practice-slip-store';
import { useI18n } from '../hooks/use-i18n';
import { Button } from '@/components/ui';

export function MobileBetSlipDrawer() {
  const { legs } = usePracticeSlipStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-9 gap-2 px-0 sm:w-auto sm:px-3 lg:hidden" aria-label={t('slip.title')}>
          <Ticket className="h-4 w-4" />
          <span className="hidden sm:inline">{t('slip.title')}</span>
          {legs.length > 0 && (
            <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {legs.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-none fixed inset-x-0 bottom-0 top-auto max-h-[80vh] w-full translate-y-0 rounded-b-none rounded-t-xl p-0 lg:hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-sm">{t('slip.title')}</DialogTitle>
        </DialogHeader>
        <div className="h-[calc(80vh-60px)] p-4 pt-0">
          <PracticeBetSlip />
        </div>
      </DialogContent>
    </Dialog>
  );
}
