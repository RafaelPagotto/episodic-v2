import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SummarySkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-10" />
        </div>
        <Skeleton className="size-10" />
      </CardContent>
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Skeleton className="h-9 w-44" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SummarySkeleton key={index} />
        ))}
      </div>

      <div className="space-y-4">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-3 h-4 w-full max-w-sm" />
          </div>
        <div className="grid gap-3">
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index}>
              <CardContent className="flex gap-4 p-4">
                <Skeleton className="aspect-[2/3] w-20" />
                <div className="flex-1 space-y-4">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <Skeleton className="h-2 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
