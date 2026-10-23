import { listing } from "../../../../listing";
export function GET(request) {
  const params = new URL(request.url).searchParams;
  return Response.json(listing({ feed: params.get("feed") || "trending", page: Number(params.get("page") || 1), q: "" }));
}
