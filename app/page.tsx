import { redirect } from "next/navigation";
import { getEffectivePersona } from "@/lib/personas/effective-persona";

/**
 * Root redirect. Logged-in users are sent to their persona's default landing
 * page (e.g. filing agents → /filing, intake → /leads). Anyone without a
 * session falls through to /login — middleware handles the unauth case too.
 */
export default async function Home() {
  const persona = await getEffectivePersona();
  if (!persona) {
    redirect("/login");
  }
  redirect(persona.config.defaultRoute);
}
