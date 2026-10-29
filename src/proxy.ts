import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast gate for the back office: no session cookie → login page.
 * The real check (valid session, 2FA, role) happens in requireStaff() on every page and action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !request.cookies.has("eg_admin")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
