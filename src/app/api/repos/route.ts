import { NextResponse } from "next/server";
import { validDatabase, validRepoUrl } from "@/lib/engine/input-validation";
import { prisma } from "@/lib/prisma";

export async function GET() {
	try {
		const repos = await prisma.targetRepo.findMany({ orderBy: { lastUsedAt: "desc" } });
		return NextResponse.json(repos);
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const raw = String(body.repoUrl ?? "").trim();
		// validRepoUrl defaults blanks to the default repo — blanks must not register
		const repoUrl = raw ? validRepoUrl(raw) : null;
		if (!repoUrl) {
			return NextResponse.json(
				{ error: "repoUrl must be a valid git URL or local path" },
				{ status: 400 },
			);
		}
		const database = validDatabase(body.database);
		const repo = await prisma.targetRepo.upsert({
			where: { repoUrl },
			create: { repoUrl, database },
			update: { database, lastUsedAt: new Date() },
		});
		return NextResponse.json(repo);
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 400 });
	}
}
