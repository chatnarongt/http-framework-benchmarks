import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TestType } from "@/lib/engine/types";

export const TEST_TYPE_DETAILS: Record<TestType, string> = {
	plaintext:
		"GET /bench/plaintext. No database. One request per record, shared across the VUs. Measures raw HTTP overhead.",
	json: "GET /bench/json. No database. One request per record, shared across the VUs. Measures JSON serialization.",
	"read-one":
		"GET /bench/read-one?id=1..N. Fresh database seeded with N rows. Each id is read once.",
	"read-many":
		"GET /bench/read-many?limit=20&afterId=0,20,... Seeded with N rows. N/20 requests, each returns 20 rows by keyset on id.",
	"create-one": "GET /bench/create-one?randomNumber=X. Fresh empty database. N single inserts.",
	"create-many":
		"GET /bench/create-many with 20 randomNumber params. Fresh empty database. N/20 requests, 20 inserts each.",
	"update-one":
		"GET /bench/update-one?record={id,randomNumber}. Seeded. Each id 1..N is updated once with a random value.",
	"update-many":
		"GET /bench/update-many with 20 record params. Seeded. N/20 requests, each updates 20 consecutive ids.",
	"delete-one":
		"GET /bench/delete-one?id=1..N. Seeded. Each id is deleted once. Warmup runs read-one instead.",
	"delete-many":
		"GET /bench/delete-many with 20 id params. Seeded. N/20 requests, 20 consecutive ids each. Warmup runs read-one instead.",
};

export const testTypeTipId = (type: TestType) => `tip-${type}`;

export function TestTypeTip({
	type,
	align,
	children,
}: {
	type: TestType;
	align: string;
	children: ReactNode;
}) {
	return (
		<div className="group relative">
			{children}
			<span
				id={testTypeTipId(type)}
				role="tooltip"
				className={cn(
					"pointer-events-none invisible absolute top-full z-10 mt-1 w-64 max-w-[80vw] rounded-lg border border-slate-700 bg-slate-900 p-2.5 font-mono font-normal text-slate-300 text-xs opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100",
					align,
				)}
			>
				{TEST_TYPE_DETAILS[type]}
			</span>
		</div>
	);
}
