import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/ui/notice";
import { createOptionalSupabaseServerClient } from "@/lib/supabase/server";

import { getUserProfileData, ProfileDataError } from "../data";
import type { ProfilePageData } from "../types";
import { ProfileView } from "./profile-view";

type ProfilePageState = {
  data: ProfilePageData | null;
  errorMessage: string;
};

async function getProfilePageState(): Promise<ProfilePageState> {
  const supabase = await createOptionalSupabaseServerClient();

  if (!supabase) {
    return {
      data: null,
      errorMessage: "Supabase is not configured yet.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      data: null,
      errorMessage: "Sign in to view your profile.",
    };
  }

  try {
    return {
      data: await getUserProfileData(supabase, user.id, user.email),
      errorMessage: "",
    };
  } catch (error) {
    return {
      data: null,
      errorMessage: error instanceof ProfileDataError ? error.message : "Unable to load your profile.",
    };
  }
}

export async function ProfilePageContent() {
  const { data, errorMessage } = await getProfilePageState();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        description="Your account, library statistics, and display preferences."
        title="Profile"
      />

      {errorMessage || !data ? (
        <Notice tone="error">{errorMessage || "Unable to load your profile."}</Notice>
      ) : (
        <ProfileView data={data} />
      )}
    </section>
  );
}
