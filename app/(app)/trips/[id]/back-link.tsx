"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIST_KEY } from "../../filter-url";

/** "All trips", back to the list as you left it (filters and sort), or the plain list for a shared link. */
export function BackLink() {
  const [href, setHref] = useState("/");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(LIST_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
      if (saved?.startsWith("/")) setHref(saved);
    } catch {}
  }, []);
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent">
      ‹ All trips
    </Link>
  );
}
