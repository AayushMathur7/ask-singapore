import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const interDisplay = Inter({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ask Singapore",
  description:
    "Ask synthetic Singapore personas a question and view neighborhood-level sentiment on a map.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${interSans.variable} ${interDisplay.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
