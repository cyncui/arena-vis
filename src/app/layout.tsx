import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arena 3D",
  description: "3D visualization of are.na channels",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
