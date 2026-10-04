import Link from "next/link";
import { Activity, BarChart2, LineChart, PlayCircle } from "lucide-react";

export function Navbar() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-3 text-sky-400 font-bold text-lg tracking-wide">
          <Activity className="w-6 h-6 text-sky-400" />
          <span className="text-white">Bench<span className="text-sky-400">Hub</span></span>
        </Link>
        <nav className="flex items-center space-x-6 text-sm font-medium">
          <Link
            href="/"
            className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            <span>New Benchmark</span>
          </Link>
          <Link
            href="/summary"
            className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
          >
            <LineChart className="w-4 h-4" />
            <span>Summary</span>
          </Link>
          <Link
            href="/reports"
            className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            <span>Reports</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
