import type { Metadata } from "next";
import { Suspense } from "react";
import { NotesDialog } from "@/components/notes/CompanyNotes";
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
          {/* A company's notes open as a dialog over any page (?notes=<id>). */}
          <Suspense fallback={null}>
            <NotesDialog />
          </Suspense>
          <UpdateBanner />
        </AppProvider>
      </body>
    </html>
  );
}
