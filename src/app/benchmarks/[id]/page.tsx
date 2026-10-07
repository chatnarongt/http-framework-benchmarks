"use client";

import { useParams } from "next/navigation";
import BenchmarkView from "./benchmark-view";

export default function BenchmarkLivePage() {
	const params = useParams();
	const id = params.id as string;
	return <BenchmarkView id={id} />;
}
