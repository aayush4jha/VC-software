import type { Metadata } from "next";
import UpdateBanner from '@/components/layout/UpdateBanner';
import "./globals.css";
import { AppProvider } from "@/lib/context";

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
      <body>
        <AppProvider>
          {children}
          <UpdateBanner />
        </AppProvider>
      </body>
    </html>
  );
}
