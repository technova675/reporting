import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adbibe Growth Console",
  description:
    "Internal console for Adbibe's AI marketing audits and outbound prospecting pipeline.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
