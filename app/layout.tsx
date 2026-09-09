import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echo Island — เกาะที่จดจำคุณ",
  description: "เกมผจญภัยเอาตัวรอด 3D ที่เล่นได้ทันทีบนเว็บ",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
