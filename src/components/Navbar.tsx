import { Activity, BarChart2, LineChart, PlayCircle } from "lucide-react";
import Link from "next/link";

export function Navbar() {
	return (
		<header className="sticky top-0 z-50 border-slate-800 border-b bg-slate-950/80 backdrop-blur">
			<div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
				<Link
					href="/"
					className="flex items-center space-x-3 font-bold text-lg text-sky-400 tracking-wide"
				>
					<Activity className="h-6 w-6 text-sky-400" />
					<span className="text-white">
						Bench<span className="text-sky-400">Hub</span>
					</span>
				</Link>
				<nav className="flex items-center space-x-6 font-medium text-sm">
					<Link
						href="/"
						className="flex items-center space-x-2 text-slate-300 transition-colors hover:text-white"
					>
						<PlayCircle className="h-4 w-4" />
						<span>New Benchmark</span>
					</Link>
					<Link
						href="/summary"
						className="flex items-center space-x-2 text-slate-300 transition-colors hover:text-white"
					>
						<LineChart className="h-4 w-4" />
						<span>Summary</span>
					</Link>
					<Link
						href="/reports"
						className="flex items-center space-x-2 text-slate-300 transition-colors hover:text-white"
					>
						<BarChart2 className="h-4 w-4" />
						<span>Reports</span>
					</Link>
				</nav>
			</div>
		</header>
	);
}
