import { state } from "../../../clock";
import { getPublicDiscoverListing } from "../../../../../../features/discover/data";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const feed = params.get("feed") ?? "popular";
  const page = Number(params.get("page") ?? "1");
  try {
    const data = await getPublicDiscoverListing(feed, page);
    return Response.json({ data, calls: state.count });
  } catch { return Response.json({ unavailable: true, calls: state.count }, { status: 503 }); }
}
