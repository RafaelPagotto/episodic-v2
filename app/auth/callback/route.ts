import { NextResponse, type NextRequest } from "next/server";

import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNextPath(request: NextRequest) {
  const nextPath = request.nextUrl.searchParams.get("next");

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/library";
  }

  return nextPath;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(request);
  const redirectUrl = new URL(nextPath, request.url);

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.redirect(redirectUrl);
}
