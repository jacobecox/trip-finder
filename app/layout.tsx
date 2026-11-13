import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trip Finder",
  description: "Ranks the resort availability list by cost and things to do",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Trips", statusBarStyle: "black-translucent" },
};

// viewport-fit=cover + the header's safe-area padding keep the home-screen app clear of the iPhone notch
export const viewport: Viewport = { themeColor: "#0c0e12", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-ink">{children}</body>
    </html>
  );
}
