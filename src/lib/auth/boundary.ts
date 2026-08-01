export type AuthRedirectInput = {
  configured: boolean;
  authenticated: boolean;
  pathname: string;
  search: string;
};

const authEntryPaths = new Set(["/auth/sign-in", "/auth/sign-up"]);

export function isProtectedAppPath(pathname: string) {
  return pathname === "/" || pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

export function authRedirect({ configured, authenticated, pathname, search }: AuthRedirectInput) {
  if (!configured) return null;

  if (!authenticated && isProtectedAppPath(pathname)) {
    const next = `${pathname}${search}`;
    return `/auth/sign-in?next=${encodeURIComponent(next)}`;
  }

  if (authenticated && authEntryPaths.has(pathname)) return "/";
  return null;
}
