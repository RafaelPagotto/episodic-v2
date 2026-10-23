import { listing } from "../../../../listing";
export function GET(request) {
  const params = new URL(request.url).searchParams;
  return Response.json(listing({ q: params.get("query"), searchPage: Number(params.get("page") || 1) }));
}
