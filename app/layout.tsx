import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { geist, geistMono } from "@/lib/fonts";
import { Toaster } from "@/components/ui/sonner";
import { ThemeWrapper } from "@/components/layout/theme-wrapper";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

/**
 * Inline script that runs before React hydrates — resolves the persisted
 * theme mode (`light` / `dark` / `system`) from cookie, then from
 * localStorage, then OS preference, and writes `.dark` class + `data-theme`
 * attribute on <html>. Writing this synchronously in <head> is the
 * Tailwind v4 best practice to avoid a flash of light content when dark is
 * the user's saved preference (FOUC-free).
 *
 * The cookie gives us a value during server rendering; the script only runs
 * client-side as a safety net in case the cookie was absent (first visit,
 * prefetch) or stale (user toggled `prefers-color-scheme` in another tab).
 */
const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var c=document.cookie.split('; ').find(function(r){return r.indexOf('${THEME_COOKIE}=')===0;});var cookieMode=c?c.split('=')[1]:null;var m=cookieMode||localStorage.getItem('favorble-theme')||'system';if(m!=='light'&&m!=='dark'&&m!=='system')m='system';var resolved=m==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;if(resolved==='dark')d.classList.add('dark');d.setAttribute('data-theme',resolved);}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "Favorble — by Hogan Smith",
    template: "%s | Favorble",
  },
  description: "Social Security Disability Legal Practice Platform",
  openGraph: {
    title: "Favorble — by Hogan Smith",
    description: "Social Security Disability Legal Practice Platform",
    siteName: "Favorble",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const scrollbarPref = cookieStore.get("favorble_scrollbars")?.value;
  const hideScrollbars = scrollbarPref !== "visible";

  // Read the persisted theme cookie so SSR emits the correct <html> class +
  // data-theme attribute. The inline script re-runs this on the client to
  // handle first visits (no cookie yet) and OS preference changes.
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;
  const ssrTheme =
    cookieTheme === "dark" || cookieTheme === "light" ? cookieTheme : "light";
  const htmlClass = [
    geist.variable,
    geistMono.variable,
    hideScrollbars ? "scrollbars-hidden" : "",
    ssrTheme === "dark" ? "dark" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tree = (
    <html lang="en" className={htmlClass} data-theme={ssrTheme}>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: required to avoid FOUC; static string.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeWrapper>
          {children}
          <Toaster />
        </ThemeWrapper>
      </body>
    </html>
  );

  // In demo mode we skip ClerkProvider entirely so its client runtime
  // doesn't try to redirect unauthenticated visitors to Clerk's hosted
  // Account Portal (close-calf-26.clerk.accounts.dev), which breaks the
  // Claude preview panel and any localhost-only browser.
  if (!AUTH_ENABLED) {
    return tree;
  }

  return <ClerkProvider>{tree}</ClerkProvider>;
}
