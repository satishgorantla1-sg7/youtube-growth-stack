import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirect } from "@/lib/auth/boundary";
import type { Database } from "@/lib/supabase/database.types";

function redirectWithCookies(request: NextRequest, response: NextResponse, destination: string) {
  const redirected = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
  return redirected;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const destination = authRedirect({
    configured: true,
    authenticated: !error && Boolean(data?.claims?.sub),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  return destination ? redirectWithCookies(request, response, destination) : response;
}
