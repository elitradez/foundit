import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyStaffSessionToken } from "@/lib/staff-token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/staff/login")) {
    const token = request.cookies.get("staff_session")?.value;
    if (token && (await verifyStaffSessionToken(token))) {
      return NextResponse.redirect(new URL("/staff", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/staff")) {
    const token = request.cookies.get("staff_session")?.value;
    if (!(await verifyStaffSessionToken(token))) {
      const login = new URL("/staff/login", request.url);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff", "/staff/:path*"],
};
