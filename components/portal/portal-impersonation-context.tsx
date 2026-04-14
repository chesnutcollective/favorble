"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Context broadcast by the portal layout so Wave 2 components (messaging
 * composer, document uploader, appointment actions, etc.) can disable their
 * write paths when a staff user is impersonating a claimant via
 * `?impersonate=<contactId>`.
 *
 * Wave 2 usage:
 *
 *   const { isImpersonating } = usePortalImpersonation();
 *   <Button disabled={isImpersonating}>Send</Button>
 */
type PortalImpersonationContextValue = {
  isImpersonating: boolean;
  impersonatorClerkId: string | null;
  viewingName: string;
};

const PortalImpersonationContext =
  createContext<PortalImpersonationContextValue>({
    isImpersonating: false,
    impersonatorClerkId: null,
    viewingName: "",
  });

export function PortalImpersonationProvider({
  value,
  children,
}: {
  value: PortalImpersonationContextValue;
  children: ReactNode;
}) {
  const memoized = useMemo(
    () => ({
      isImpersonating: value.isImpersonating,
      impersonatorClerkId: value.impersonatorClerkId,
      viewingName: value.viewingName,
    }),
    [value.isImpersonating, value.impersonatorClerkId, value.viewingName],
  );
  return (
    <PortalImpersonationContext.Provider value={memoized}>
      {children}
    </PortalImpersonationContext.Provider>
  );
}

export function usePortalImpersonation(): PortalImpersonationContextValue {
  return useContext(PortalImpersonationContext);
}
