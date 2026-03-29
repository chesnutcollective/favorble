"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionKey, setTransitionKey] = useState(pathname);

  useEffect(() => {
    setDisplayChildren(children);
    setTransitionKey(pathname);
  }, [children, pathname]);

  return (
    <div key={transitionKey} className="animate-page-in">
      {displayChildren}
    </div>
  );
}
