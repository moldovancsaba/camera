'use client';

import { useRouter } from 'next/navigation';
import { AppButton } from '@/components/ui/AppButton';

type Props = {
  /** Spacing above the stack (Tailwind), e.g. `mt-6` */
  className?: string;
};

/** Full-width BACK control — same `app-btn` sizing as other FFF stacks (landing, log wizard). */
export default function FffHistoryHomeButton({ className }: Props) {
  const router = useRouter();
  return (
    <div className={['app-btn-stack', className].filter(Boolean).join(' ')}>
      <AppButton type="button" variant="secondary" onClick={() => router.push('/')}>
        BACK
      </AppButton>
    </div>
  );
}
