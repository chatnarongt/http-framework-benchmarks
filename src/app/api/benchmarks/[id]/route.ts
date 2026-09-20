import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const run = await prisma.benchmarkRun.findUnique({
      where: { id },
      include: {
        results: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Benchmark run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
