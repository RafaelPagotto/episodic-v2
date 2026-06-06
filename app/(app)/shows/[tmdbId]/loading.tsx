import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShowDetailLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-6 md:flex-row">
            <Skeleton className="aspect-[2/3] w-36 shrink-0" />
            <div className="flex flex-1 flex-col gap-4">
              <Skeleton className="h-8 w-64 max-w-full" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="mt-4 h-2 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
