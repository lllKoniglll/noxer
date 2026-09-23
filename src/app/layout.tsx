import type { Metadata } from "next";
import "./globals.css";
import { UploadProvider } from "./upload-context";

export const metadata: Metadata = {
  title: "Noxer",
  description: "Ekonomivisualisering for SIE4-filer"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>
        <UploadProvider>
          {children}
        </UploadProvider>
      </body>
    </html>
  );
}
