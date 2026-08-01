import { NextResponse } from "next/server";
import { approvalDecisionSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const parsed = approvalDecisionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
  return NextResponse.json({ ...parsed.data, decidedAt: new Date().toISOString(), auditId: crypto.randomUUID() });
}
