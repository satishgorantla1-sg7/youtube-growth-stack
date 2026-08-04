import { NextResponse } from "next/server";
import { decidePackageApproval, packageDecisionInputSchema } from "@/lib/packages/server";
import { packageErrorResponse, packageRequestContext } from "../../../route-utils";

export async function POST(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const route = await params;
  const body = await request.json().catch(() => null) as unknown;
  const parsed = packageDecisionInputSchema.safeParse({ ...(typeof body === "object" && body ? body : {}), approvalId: route.approvalId });
  if (!parsed.success) return NextResponse.json({ error: "invalid_package_decision", issues: parsed.error.issues }, { status: 400 });
  const context = await packageRequestContext();
  if ("response" in context) return context.response;
  try { return NextResponse.json(await decidePackageApproval(context.client, parsed.data.approvalId, parsed.data.decision, parsed.data.note)); }
  catch (error) { return packageErrorResponse(error); }
}
