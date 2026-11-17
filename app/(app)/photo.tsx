"use client";

import { Mountain } from "lucide-react";
import { useState } from "react";
import type { Photo } from "@/lib/photos/ref";

/**
 * A resort's photo filling its box, with the credit Google asks for in the corner.
 * No photo, or one that fails to load, shows a quiet placeholder so cards stay the same shape.
 * Plain <img>: the Google photos come from our signed-in route, which Next's image optimizer
 * can't fetch.
 */
export function PropertyPhoto({
  photo,
  alt,
  className = "",
  eager = false,
}: {
  photo: Photo | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const ok = photo && failed !== photo.src;
  return (
    <div className={`relative overflow-hidden bg-[linear-gradient(135deg,#1e2433,#141821)] ${className}`}>
      {ok ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={photo.src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(photo.src)}
          />
          <Credit photo={photo} />
        </>
      ) : (
        <Mountain aria-hidden className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white/10" />
      )}
    </div>
  );
}

function Credit({ photo }: { photo: Photo }) {
  const text = photo.credit ? `Photo: ${photo.credit} · Google Maps` : "Photo: Google Maps";
  const cls =
    "absolute right-1.5 bottom-1.5 z-10 max-w-[70%] truncate rounded bg-black/55 px-1.5 py-px text-[10px] text-white/85 backdrop-blur-sm hover:text-white";
  return photo.creditUrl ? (
    <a className={cls} href={photo.creditUrl} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span className={cls}>{text}</span>
  );
}
