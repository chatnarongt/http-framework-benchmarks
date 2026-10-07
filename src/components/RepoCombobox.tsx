"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { extractRepoName } from "@/lib/engine/types";

export interface KnownRepo {
	id: string;
	repoUrl: string;
	database: string;
}

interface RepoComboboxProps {
	value: string;
	suggestions: KnownRepo[];
	onChange: (url: string) => void;
	/** Blur commit for free-typed URLs (register as suggestion). */
	onCommit: (url: string) => void;
	/** Suggestion picked: parent receives the remembered database too. */
	onSelect: (url: string, database: string) => void;
	onDelete: (id: string) => void;
}

export function RepoCombobox({
	value,
	suggestions,
	onChange,
	onCommit,
	onSelect,
	onDelete,
}: RepoComboboxProps) {
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const dirtyRef = useRef(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const q = value.trim().toLowerCase();
	const filtered = suggestions.filter(
		(s) =>
			!q ||
			s.repoUrl.toLowerCase().includes(q) ||
			extractRepoName(s.repoUrl).toLowerCase().includes(q),
	);

	const close = () => {
		setOpen(false);
		setHighlight(0);
	};

	const pick = (s: KnownRepo) => {
		dirtyRef.current = false;
		onSelect(s.repoUrl, s.database);
		close();
		inputRef.current?.blur();
	};

	const handleBlur = () => {
		close();
		const url = value.trim();
		if (dirtyRef.current && url) {
			dirtyRef.current = false;
			onCommit(url);
		}
	};

	return (
		<div className="relative flex-1">
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => {
					dirtyRef.current = true;
					onChange(e.target.value);
					setOpen(true);
					setHighlight(0);
				}}
				onFocus={() => {
					setOpen(true);
					setHighlight(0);
				}}
				onBlur={handleBlur}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						close();
						return;
					}
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setOpen(true);
						setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setHighlight((h) => Math.max(h - 1, 0));
						return;
					}
					if (e.key === "Enter" && open && filtered.length > 0) {
						e.preventDefault();
						pick(filtered[Math.min(highlight, filtered.length - 1)]);
					}
				}}
				className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
				placeholder="https://github.com/..."
				role="combobox"
				aria-expanded={open}
				aria-autocomplete="list"
			/>
			{open && filtered.length > 0 && (
				<ul
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox listbox pattern
					role="listbox"
					className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-800 bg-slate-900 py-2 shadow-xl"
				>
					{filtered.map((s, i) => (
						// biome-ignore lint/a11y/useFocusableInteractive: keyboard nav lives on the input (highlight + Enter)
						// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard nav lives on the input (highlight + Enter)
						<li
							key={s.id}
							// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA option in combobox listbox
							role="option"
							aria-selected={i === highlight}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(s)}
							onMouseEnter={() => setHighlight(i)}
							className={cn(
								"flex cursor-pointer items-center gap-2 px-3 py-2",
								i === highlight
									? "bg-sky-950 ring-1 ring-sky-500 ring-inset"
									: "hover:bg-slate-800/30",
							)}
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-semibold text-slate-200 text-xs">
									{extractRepoName(s.repoUrl)}
								</div>
								<div className="truncate font-mono text-slate-500 text-xs">{s.repoUrl}</div>
							</div>
							<button
								type="button"
								title="Forget saved repository"
								onMouseDown={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
								onClick={(e) => {
									e.stopPropagation();
									onDelete(s.id);
								}}
								className="shrink-0 rounded p-1 text-slate-500 hover:text-white"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
