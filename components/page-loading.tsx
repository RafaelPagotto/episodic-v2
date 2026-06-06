import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PageLoadingProps = {
  cards?: number;
};

export function PageLoading({ cards = 3 }: PageLoadingProps) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Skeleton className="h-9 w-44" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
      </div>

      <div className="grid gap-3">
        {Array.from({ length: cards }, (_, index) => (
          <Card key={index}>
            <CardContent className="flex gap-4 p-4 sm:p-5">
              <Skeleton className="aspect-[2/3] w-20 shrink-0" />
              <div className="min-w-0 flex-1 space-y-4">
                <Skeleton className="h-5 w-56 max-w-full" />
                <Skeleton className="h-4 w-72 max-w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
