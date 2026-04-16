'use client';

import Link from 'next/link';
import DeleteGymSessionButton from '@/components/gym/DeleteGymSessionButton';
import HistoryDeleteSubmissionButton from '@/components/funfitfan/HistoryDeleteSubmissionButton';

export type HistoryListRowProps = {
  href: string;
  title: string;
  subtitle: string;
  thumbUrl: string | null;
  badge: string;
  kind: 'submission' | 'gym';
  submissionId?: string;
  sessionId?: string;
  lessonTitle?: string;
};

export default function HistoryListRow({
  href,
  title,
  subtitle,
  thumbUrl,
  badge,
  kind,
  submissionId,
  sessionId,
  lessonTitle,
}: HistoryListRowProps) {
  return (
    <div className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 transition hover:border-emerald-700/60 hover:bg-slate-900">
      <Link href={href} className="flex min-w-0 flex-1 items-stretch gap-3 p-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-800">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-slate-600">
              {kind === 'gym' ? '🏋️' : '📷'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-white">{title}</span>
            <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              {badge}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subtitle}</p>
        </div>
      </Link>
      <div className="flex shrink-0 items-stretch border-l border-slate-800 bg-slate-950/30 py-2 pr-2 pl-1">
        {kind === 'gym' && sessionId && lessonTitle ? (
          <DeleteGymSessionButton sessionId={sessionId} lessonTitle={lessonTitle} appearance="fffHistory" />
        ) : kind === 'submission' && submissionId ? (
          <HistoryDeleteSubmissionButton submissionId={submissionId} label={title} />
        ) : null}
      </div>
    </div>
  );
}
