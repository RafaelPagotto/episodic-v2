import { NextResponse, type NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  // This endpoint authenticates with CRON_SECRET and must not read user sessions.
  if (request.nextUrl.pathname === "/api/cron/refresh-metadata") {
    return NextResponse.next();
  }
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
