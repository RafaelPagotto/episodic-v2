export function getShowDetailHref(tmdbId: number) {
  return `/shows/${tmdbId}`;
}

export function getShowDetailSeasonHref(tmdbId: number, seasonNumber: number) {
  return `${getShowDetailHref(tmdbId)}?season=${seasonNumber}`;
}
