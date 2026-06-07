import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { ShowDetailPageContent } from "@/features/shows/components/show-detail-page";

type ShowDetailPageProps = {
  params: Promise<{
    tmdbId: string;
  }>;
  searchParams?: Promise<{
    season?: string | string[];
  }>;
};

export default async function ShowDetailPage({ params, searchParams }: ShowDetailPageProps) {
  const { tmdbId } = await params;
  const queryParams = await searchParams;
  const seasonQueryParam = Array.isArray(queryParams?.season)
    ? queryParams.season[0] ?? null
    : queryParams?.season ?? null;
  const numericTmdbId = Number(tmdbId);

  if (!Number.isInteger(numericTmdbId) || numericTmdbId < 1) {
    return (
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <PageHeader
          description="Episode tracking for shows in your library."
          title="Show details"
        />
        <Notice tone="error">Invalid show id.</Notice>
      </section>
    );
  }

  return <ShowDetailPageContent seasonQueryParam={seasonQueryParam} tmdbId={numericTmdbId} />;
}
