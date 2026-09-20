import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const runs = await prisma.benchmarkRun.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { results: true },
        },
      },
    });

    return NextResponse.json(runs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
