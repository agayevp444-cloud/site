import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "İLHAM Studio — AI Prodüksiya Ofisi",
  description: "Claude ilə işləyən AI işçilərin yaradıcı prodüksiya işi gördüyü canlı 3D studiya.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
