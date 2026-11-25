import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Production Office",
  description: "A live 3D office of Claude-powered AI employees producing creative work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
