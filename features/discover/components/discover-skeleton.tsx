export function DiscoverSkeleton({ announce = true }: { announce?: boolean }) {
  return <div aria-busy="true" aria-label="Loading shows">
    {announce ? <p className="sr-only" role="status">Loading shows...</p> : null}
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => <div key={index} className="rounded-md border p-3 sm:p-4">
        <div className="aspect-[2/3] rounded-md bg-secondary" /><div className="mt-3 h-10 bg-secondary" /><div className="mt-3 h-20 bg-secondary" /><div className="mt-3 h-11 bg-secondary" />
      </div>)}
    </div>
  </div>;
}
