import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Secret Santa",
  description: "Automated Secret Santa using Tom7's cryptographic method",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gray-50`}>
        <Link 
          href="https://lampbylit.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="fixed top-4 left-4 z-50 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/favicon.png"
            alt="Lamp By Lit"
            width={32}
            height={32}
            className="w-8 h-8"
          />
        </Link>
        {children}
      </body>
    </html>
  );
}

