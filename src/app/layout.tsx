import type { Metadata, Viewport } from "next";
import { Bona_Nova, Dancing_Script, Poppins } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const bonaNova = Bona_Nova({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-bona-nova", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });
const dancing = Dancing_Script({ subsets: ["latin"], weight: ["500"], variable: "--font-dancing-script", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Everglow Events & Tents – Tent, Table & Chair Rentals in Winnipeg",
    template: "%s | Everglow Events & Tents",
  },
  description:
    "Event rentals in Winnipeg: marquee and pop-up tents, tables, chairs, linens, lighting and lawn games. Book online with live availability, free pickup or delivery.",
  applicationName: "Everglow Events & Tents",
  icons: { icon: "/media/site/favicon.png", apple: "/media/site/favicon.png" },
  openGraph: {
    type: "website",
    siteName: "Everglow Events & Tents",
    locale: "en_CA",
    images: [{ url: "/media/site/og.jpg", width: 1200, height: 630, alt: "Everglow Events & Tents" }],
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  themeColor: "#F7EBD3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bonaNova.variable} ${poppins.variable} ${dancing.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
