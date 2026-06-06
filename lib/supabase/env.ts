const MISSING_SUPABASE_ENV_MESSAGE =
  "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

type SupabasePublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function readSupabasePublicEnv(): SupabasePublicEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (
    supabaseUrl.includes("your-project-id")
    || supabaseAnonKey.includes("your-public-anon-key")
  ) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function getOptionalSupabasePublicEnv() {
  return readSupabasePublicEnv();
}

export function getSupabasePublicEnv() {
  const env = readSupabasePublicEnv();

  if (!env) {
    throw new Error(MISSING_SUPABASE_ENV_MESSAGE);
  }

  return env;
}
