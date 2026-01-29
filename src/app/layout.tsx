import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickeo - Marcela Koury",
  description: "Sistema de pickeo para gestión de pedidos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pickeo MK",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}
      >
        <main className="max-w-lg mx-auto px-4 py-2 sm:max-w-2xl lg:max-w-4xl">
          {children}
        </main>
      </body>
    </html>
  );
}
