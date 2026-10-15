export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="text-6xl" aria-hidden="true">⏳</span>
      <span className="sr-only">Loading</span>
    </div>
  );
}
