import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cryptopad.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Cryptopad - Secure Text Sharing",
  description:
    "Cryptopad lets you encrypt sensitive text, share it through self-destructing links, and keep private notes truly private.",
  keywords: [
    "secure notes",
    "encrypted pastebin",
    "self destruct message",
    "end to end encryption",
  ],
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Cryptopad - Secure Text Sharing",
    description:
      "Create end-to-end encrypted notes that vanish after they are viewed or after a timer you choose.",
    url: appUrl,
    siteName: "Cryptopad",
    images: [
      {
        url: "/og-preview.svg",
        width: 1200,
        height: 630,
        alt: "Cryptopad encrypted note preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cryptopad - Secure Text Sharing",
    description:
      "Generate encrypted links that quietly expire after one view or when the timer runs out.",
    images: ["/og-preview.svg"],
  },
  authors: [{ name: "Kshitiz" }],
  creator: "Kshitiz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
