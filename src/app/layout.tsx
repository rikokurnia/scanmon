import type { Metadata, Viewport } from "next";
import ScanShell from "@/components/scan-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "scanMon · A little wonder in the everyday",
  description:
    "Point your camera at an everyday barcode. Your next monster is closer than you think.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff1ce",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ScanShell>{children}</ScanShell>
      </body>
    </html>
  );
}
