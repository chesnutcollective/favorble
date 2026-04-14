import type { Metadata } from "next";
import { ExamplesGallery } from "./gallery";

export const metadata: Metadata = {
  title: "AI Review · Visual Examples",
};

/**
 * Visual prototype gallery for the entry-detail body. Five candidates
 * scored against the current production layout. Each renders the same
 * sample entry so the visual differences pop. Not wired to data — pure
 * presentation comparisons.
 */
export default function ExamplesPage() {
  return <ExamplesGallery />;
}
