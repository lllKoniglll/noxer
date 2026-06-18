import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claw Fluxweaver",
  description: "Ekonomivisualisering for SIE4-filer"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
