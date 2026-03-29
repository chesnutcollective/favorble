"use server";

import { createClient } from "@/db/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
