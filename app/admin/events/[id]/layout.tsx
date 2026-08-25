import EventWorkspaceTabs from '@/components/admin/EventWorkspaceTabs';

export default async function EventWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <EventWorkspaceTabs eventId={id} />
      {children}
    </div>
  );
}
