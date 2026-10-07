import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { cn } from "@/lib/cn";

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "HTTP Framework Benchmark Tool",
	description: "Kubernetes & k6 automated HTTP framework benchmark runner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={cn("dark", geistMono.variable)}>
			<body className="flex min-h-screen flex-col bg-slate-950 text-slate-100 antialiased">
				<Navbar />
				<main className="w-full flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
			</body>
		</html>
	);
}
