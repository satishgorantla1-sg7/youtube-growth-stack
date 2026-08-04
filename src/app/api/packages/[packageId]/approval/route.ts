import { NextResponse } from "next/server";
import { packageIdInputSchema, requestPackageApproval } from "@/lib/packages/server";
import { packageErrorResponse, packageRequestContext } from "../../route-utils";

export async function POST(_request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const parsed = packageIdInputSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "invalid_package_request" }, { status: 400 });
  const context = await packageRequestContext();
  if ("response" in context) return context.response;
  try { return NextResponse.json(await requestPackageApproval(context.client, parsed.data.packageId), { status: 201 }); }
  catch (error) { return packageErrorResponse(error); }
}
