import type { MetadataRoute } from "next";

/** Lets family members "Add to Home Screen" and open it like an app (full screen, dark, yellow icon). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trip Finder",
    short_name: "Trips",
    description: "The best resort weeks, ranked by cost and things to do",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0e12",
    theme_color: "#0c0e12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
