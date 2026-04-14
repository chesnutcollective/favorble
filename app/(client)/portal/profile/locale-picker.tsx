"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import { setPortalLocale } from "@/app/actions/portal-profile";

const LOCALES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export function ProfileLocalePicker({ current }: { current: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isImpersonating } = usePortalImpersonation();
  const normalized = current.toLowerCase().startsWith("es") ? "es" : "en";

  return (
    <div className="inline-flex rounded-full bg-[#F0EBE3] p-1">
      {LOCALES.map((loc) => {
        const active = loc.value === normalized;
        return (
          <button
            key={loc.value}
            type="button"
            disabled={isImpersonating || isPending || active}
            onClick={() => {
              startTransition(async () => {
                await setPortalLocale(loc.value);
                router.refresh();
              });
            }}
            className={
              "rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors " +
              (active
                ? "bg-white text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground") +
              (isImpersonating ? " cursor-not-allowed opacity-60" : "")
            }
          >
            {loc.label}
          </button>
        );
      })}
    </div>
  );
}
