import { NextResponse } from "next/server";
import { approveIdeaForPackage, packageIdInputSchema } from "@/lib/packages/server";
import { packageErrorResponse, packageRequestContext } from "../../../route-utils";

export async function POST(_request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const parsed = packageIdInputSchema.safeParse({ packageId: ideaId });
  if (!parsed.success) return NextResponse.json({ error: "invalid_idea_request" }, { status: 400 });
  const context = await packageRequestContext();
  if ("response" in context) return context.response;
  try { return NextResponse.json(await approveIdeaForPackage(context.client, parsed.data.packageId)); }
  catch (error) { return packageErrorResponse(error); }
}
