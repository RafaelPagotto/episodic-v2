import { NextResponse } from "next/server";

import { getUserDataExport, ProfileDataControlError } from "@/features/profile/data-controls";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        message,
      },
    },
    { status },
  );
}

export async function GET() {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return jsonError("Supabase is not configured yet.", 503);
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return jsonError("Sign in to export your data.", 401);
  }

  try {
    const exportData = await getUserDataExport(supabase, user);
    const exportedDate = new Date().toISOString().slice(0, 10);

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="episodic-export-${exportedDate}.json"`,
        "Content-Type": "application/json",
      },
    });
  } catch (routeError) {
    return jsonError(
      routeError instanceof ProfileDataControlError ? routeError.message : "Unable to export your data.",
      500,
    );
  }
}
