import { NextResponse } from "next/server";
import { benchmarkQueue } from "@/lib/engine/queue";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const stopped = await benchmarkQueue.cancel(id);
		return NextResponse.json({ success: true, stopped });
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}
