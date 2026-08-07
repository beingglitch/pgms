import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/// Reachable without a session. Everything else, pages, server actions, and
/// the blob upload route, requires one.
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cron carries its own bearer secret and has no session cookie. The
  // temporary local-only test-reset route guards itself by hostname instead.
  if (pathname.startsWith("/api/cron") || pathname === "/test-initialize") return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const signedIn = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and the icons/manifest a PWA needs
    // before sign-in.
    "/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico).*)",
  ],
};
