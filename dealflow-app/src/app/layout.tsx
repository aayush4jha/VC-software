import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dholakia Ventures — Deal Flow Management",
  description: "Pre-investment assessment pipeline management for Dholakia Ventures",
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
