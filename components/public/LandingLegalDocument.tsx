'use client';

import Link from 'next/link';
import { ArticleShell } from '@doneisbetter/gds-core/client';
import { Button, Text } from '@mantine/core';
import PublicShell from '@/components/public/PublicPageShell';

interface LandingLegalDocumentProps {
  slug: string;
  eventName: string;
  title: string;
  body: string;
}

export default function LandingLegalDocument({
  slug,
  eventName,
  title,
  body,
}: LandingLegalDocumentProps) {
  return (
    <PublicShell size="lg">
      <ArticleShell
        eyebrow={eventName}
        title={title}
        meta={
          <Button component={Link} href={`/landing/${slug}`} variant="default">
            Back to landing page
          </Button>
        }
      >
        <Text
          c="dark.7"
          size="sm"
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
        >
          {body}
        </Text>
      </ArticleShell>
    </PublicShell>
  );
}
