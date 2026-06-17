import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GTOCentral Reels Studio",
  description: "Draft, edit, preview and render GTOCentral marketing Reels.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
