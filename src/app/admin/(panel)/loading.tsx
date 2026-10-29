/** Shown while an admin page loads its data (navigations between admin pages). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-16 border-b border-admin-line bg-white" />
      <div className="space-y-4 p-4 md:p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-admin-line bg-white" />
        ))}
      </div>
    </div>
  );
}
