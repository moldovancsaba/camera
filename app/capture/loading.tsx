// This page sits above the event and does not know its language, so it says it in both (issue 352).
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-xl">Loading... / Betöltés...</p>
      </div>
    </div>
  );
}
