"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/db/server";
import { VIEW_AS_COOKIE_NAME } from "@/lib/personas/effective-persona";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

/**
 * Cookie used to simulate a signed-out state when Clerk auth is disabled
 * (ENABLE_CLERK_AUTH !== "true"). The session loader checks for this cookie
 * and returns null rather than the default demo user.
 */
export const DEMO_SIGNED_OUT_COOKIE = "favorble_demo_signed_out";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (!data.session) {
      return { error: "No session returned" };
    }
  } catch (e) {
    // Re-throw NEXT_REDIRECT errors (from redirect())
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return {
      error: `Login failed: ${e instanceof Error ? e.message : "Unknown error"}`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Sign the current user out. Handles both real Clerk sessions (production)
 * and the demo-mode fallback (staging / local dev) so the Sign Out button
 * actually visibly signs the user out in both environments.
 */
export async function logout() {
  const cookieStore = await cookies();

  // Always clear the view-as impersonation cookie on sign-out so the next
  // session starts fresh.
  cookieStore.delete(VIEW_AS_COOKIE_NAME);

  if (AUTH_ENABLED) {
    // Real Clerk session — clear Clerk's own cookies by resolving the
    // current auth() and calling sessions.revokeSession on it is the
    // textbook path, but Clerk's middleware-driven cookie model means
    // simply clearing Clerk's __session / __client cookies is enough for
    // the redirect-to-login flow.
    for (const name of ["__session", "__clerk_db_jwt", "__client_uat"]) {
      cookieStore.delete(name);
    }
  } else {
    // Demo mode — flag the session as signed-out so getSession() returns
    // null instead of auto-re-creating the demo admin user.
    cookieStore.set(DEMO_SIGNED_OUT_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Clear the demo-signed-out cookie so the next request falls back to the
 * default demo admin user again. Only meaningful when Clerk auth is
 * disabled (the /login page surfaces a "Sign in as demo" button that
 * calls this).
 */
export async function signInAsDemo() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SIGNED_OUT_COOKIE);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
