import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import {
  extractPublicChurchSlugFromHost,
  publicChurchSlugCookieName,
} from "@/lib/public-host-routing";
import {
  getSupabaseEnvForSurface,
  getSupabaseRefreshSurfacesForPath,
  hasSupabaseEnvForSurface,
  type SupabaseSurface,
} from "@/lib/supabase/config";

function applyPublicChurchCookie(request: NextRequest, response: NextResponse) {
  const slug = extractPublicChurchSlugFromHost(request.headers.get("host"));

  if (slug) {
    response.cookies.set(publicChurchSlugCookieName, slug, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  } else {
    response.cookies.delete(publicChurchSlugCookieName);
  }

  return response;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const surfaces = getSupabaseRefreshSurfacesForPath(request.nextUrl.pathname);

  for (const surface of surfaces) {
    await refreshSupabaseSurfaceSession({
      request,
      surface,
      updateResponse(nextResponse) {
        response = nextResponse;
      },
    });
  }

  return applyPublicChurchCookie(request, response);
}

async function refreshSupabaseSurfaceSession({
  request,
  surface,
  updateResponse,
}: {
  request: NextRequest;
  surface: SupabaseSurface;
  updateResponse: (response: NextResponse) => void;
}) {
  if (!hasSupabaseEnvForSurface(surface)) {
    return;
  }

  const { url, publishableKey } = getSupabaseEnvForSurface(surface);

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        const nextResponse = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          nextResponse.cookies.set(name, value, options);
        });

        updateResponse(nextResponse);
      },
    },
  });

  await supabase.auth.getUser();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
