import { state } from "../../../clock";
export const dynamic = "force-dynamic";
export async function POST(request) {
  const body = await request.json();
  if (body.advance) state.offset += body.advance;
  if (typeof body.fail === "boolean") state.fail = body.fail;
  return Response.json({ calls: state.count, now: Date.now() });
}
