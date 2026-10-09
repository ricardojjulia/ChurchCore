import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { KIOSK_COOKIE_NAME, KIOSK_HOME_PATH, shouldRedirectToKiosk } from "@/lib/ccm-kiosk-constants";
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
  // A tablet in kiosk mode (G2.2) goes back to the kiosk start screen from any
  // other page. UX only: the cookie grants nothing by itself, and every kiosk
  // server action re-checks the admin's session and the kiosk session row.
  if (
    shouldRedirectToKiosk(request.nextUrl.pathname, request.cookies.has(KIOSK_COOKIE_NAME))
  ) {
    return NextResponse.redirect(new URL(KIOSK_HOME_PATH, request.url));
  }

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
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
