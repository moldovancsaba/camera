'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  return (
    <div className="fff-history-row">
      <button
        type="button"
        className="fff-history-row-link fff-history-row-nav-btn"
        aria-label={`Open details: ${title}`}
        onClick={() => router.push(href)}
      >
        <div className="fff-history-thumb">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="fff-history-thumb-placeholder">
              {kind === 'gym' ? '⭐' : '📷'}
            </div>
          )}
        </div>
        <div className="fff-history-body">
          <div className="fff-history-title-row">
            <span className="fff-history-title">{title}</span>
            <span className="fff-history-badge">{badge}</span>
          </div>
          <p className="fff-history-subtitle">{subtitle}</p>
        </div>
      </button>
      <div className="fff-history-actions">
        {kind === 'gym' && sessionId && lessonTitle ? (
          <DeleteGymSessionButton sessionId={sessionId} lessonTitle={lessonTitle} appearance="fffHistory" />
        ) : kind === 'submission' && submissionId ? (
          <HistoryDeleteSubmissionButton submissionId={submissionId} label={title} />
        ) : null}
      </div>
    </div>
  );
}
