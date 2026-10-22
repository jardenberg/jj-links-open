import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JJ Links",
  description: "A calm, self-hosted control plane for Cloudflare Bulk Redirects.",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
