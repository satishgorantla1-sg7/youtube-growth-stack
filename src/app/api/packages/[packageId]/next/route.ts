import { NextResponse } from "next/server";
import { createNextPackageVersion, nextPackageInputSchema } from "@/lib/packages/server";
import { packageErrorResponse, packageRequestContext } from "../../route-utils";

export async function POST(request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const route = await params;
  const body = await request.json().catch(() => null) as unknown;
  const parsed = nextPackageInputSchema.safeParse({ ...(typeof body === "object" && body ? body : {}), packageId: route.packageId });
  if (!parsed.success) return NextResponse.json({ error: "invalid_package_request", issues: parsed.error.issues }, { status: 400 });
  const context = await packageRequestContext();
  if ("response" in context) return context.response;
  try { return NextResponse.json(await createNextPackageVersion(context.client, parsed.data.packageId, parsed.data.idempotencyKey), { status: 201 }); }
  catch (error) { return packageErrorResponse(error); }
}
