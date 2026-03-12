import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Use an explicit site URL so Open Graph / Twitter images resolve correctly.
// Configure via NEXT_PUBLIC_SITE_URL in the environment; fall back to localhost in dev.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kabo",
  description: "A spatial interface for wandering through connected ideas.",
  openGraph: {
    title: "Kabo",
    description: "A spatial interface for wandering through connected ideas.",
    images: [
      {
        url: "/images/opengraph.jpg",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
