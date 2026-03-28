import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SyncQueueWorker } from '@/components/sync/SyncQueueWorker';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Deep Racer Simulator",
  description: "Drive. Train. Race the AI.",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white overflow-hidden`}>
        <SyncQueueWorker />
        {children}
      </body>
    </html>
  );
}
