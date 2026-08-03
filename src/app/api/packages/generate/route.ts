import { NextResponse } from "next/server";
import { generatePackageForUser, packageGenerationInputSchema } from "@/lib/packages/server";
import { packageErrorResponse, packageRequestContext } from "../route-utils";

export async function POST(request: Request) {
  const parsed = packageGenerationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_package_generation_request", issues: parsed.error.issues }, { status: 400 });
  const context = await packageRequestContext();
  if ("response" in context) return context.response;
  try {
    const result = await generatePackageForUser(context.client, { ...parsed.data, workspaceId: context.workspaceId, userId: context.user.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return packageErrorResponse(error); }
}
