"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const SCROLLBAR_COOKIE = "favorble_scrollbars";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Set the scrollbar visibility preference.
 * @param visible - true to show scrollbars, false to hide them
 */
export async function setScrollbarPreference(visible: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SCROLLBAR_COOKIE, visible ? "visible" : "hidden", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/settings/preferences");
}

/**
 * Read the scrollbar visibility preference from cookies.
 * Defaults to `false` (hidden) when the cookie is not set.
 */
export async function getScrollbarPreference(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SCROLLBAR_COOKIE)?.value;
  return value === "visible";
}
