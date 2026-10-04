import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HTTP Framework Benchmark Tool",
  description: "Kubernetes & k6 automated HTTP framework benchmark runner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${geistMono.variable}`}>
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
        <Navbar />
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </body>
    </html>
  );
}
