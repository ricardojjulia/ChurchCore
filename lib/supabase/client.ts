import { createBrowserClient } from "@supabase/ssr";

import {
  getSupabaseEnvForSurface,
  type SupabaseSurface,
} from "@/lib/supabase/config";

export function createClient(surface: SupabaseSurface) {
  const { url, publishableKey } = getSupabaseEnvForSurface(surface);

  return createBrowserClient(url, publishableKey);
}
