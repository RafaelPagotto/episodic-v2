import { NextResponse, type NextRequest } from "next/server";

import {
  createOptionalSupabaseCookieWriteRequiredServerClient,
  isSupabaseAuthCookieWriteError,
} from "@/lib/supabase/server";

const AUTH_CALLBACK_ERROR_CODES = {
  authFailed: "auth_callback_failed",
  authUnconfigured: "auth_unconfigured",
  missingCode: "missing_auth_code",
  sessionPersistenceFailed: "session_persistence_failed",
} as const;

type AuthCallbackErrorCode = typeof AUTH_CALLBACK_ERROR_CODES[keyof typeof AUTH_CALLBACK_ERROR_CODES];

function getSafeNextPath(request: NextRequest) {
  const nextPath = request.nextUrl.searchParams.get("next");

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/library";
  }

  return nextPath;
}

function redirectToSignIn(request: NextRequest, errorCode: AuthCallbackErrorCode) {
  const redirectUrl = new URL("/sign-in", request.url);
  redirectUrl.searchParams.set("error", errorCode);

  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(request);
  const redirectUrl = new URL(nextPath, request.url);

  if (!code) {
    return redirectToSignIn(request, AUTH_CALLBACK_ERROR_CODES.missingCode);
  }

  const supabase = await createOptionalSupabaseCookieWriteRequiredServerClient();

  if (!supabase) {
    return redirectToSignIn(request, AUTH_CALLBACK_ERROR_CODES.authUnconfigured);
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth] Supabase auth callback exchange failed.");
      return redirectToSignIn(request, AUTH_CALLBACK_ERROR_CODES.authFailed);
    }
  } catch (error) {
    if (isSupabaseAuthCookieWriteError(error)) {
      return redirectToSignIn(request, AUTH_CALLBACK_ERROR_CODES.sessionPersistenceFailed);
    }

    console.error("[auth] Supabase auth callback failed unexpectedly.");
    return redirectToSignIn(request, AUTH_CALLBACK_ERROR_CODES.authFailed);
  }

  return NextResponse.redirect(redirectUrl);
}
