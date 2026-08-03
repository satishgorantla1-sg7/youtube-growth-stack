import { z } from "zod";

const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max);
export const thumbnailConceptSchema = z.object({
  concept: boundedText(5, 160),
  visualDescription: boundedText(10, 600),
  overlayText: boundedText(1, 80).nullable(),
}).strict();
export const outlineSectionSchema = z.object({
  section: boundedText(2, 120),
  purpose: boundedText(5, 400),
  keyPoints: z.array(boundedText(2, 300)).min(1).max(8),
}).strict();
export const generatedContentPackageSchema = z.object({
  titles: z.array(boundedText(5, 120)).min(1).max(10),
  thumbnailConcepts: z.array(thumbnailConceptSchema).min(1).max(6),
  hooks: z.array(boundedText(5, 300)).min(1).max(10),
  outline: z.array(outlineSectionSchema).min(3).max(20),
  script: boundedText(100, 30_000),
  citations: z.array(z.string().uuid()).min(1).max(10),
}).strict();
export type GeneratedContentPackage = z.infer<typeof generatedContentPackageSchema>;

export type PackageEvidence = { id: string; title: string | null; content: string | null; url: string };
export type ContentPackageGenerationRequest = {
  workspaceId: string; ideaId: string; ideaTitle: string; ideaPremise: string;
  evidence: PackageEvidence[];
};
export interface ContentPackageProvider {
  generate(input: ContentPackageGenerationRequest, signal: AbortSignal): Promise<unknown>;
}
export interface ContentPackageRepository {
  persist(input: { request: ContentPackageGenerationRequest; idempotencyKey: string; requestedBy: string;
    modelVersion: string; promptVersion: string; content: GeneratedContentPackage }): Promise<unknown>;
}
export class ContentPackageGenerationError extends Error {
  constructor(readonly code: "invalid_package_request" | "invalid_package_output" | "invalid_package_evidence" | "package_generation_timeout" | "package_generation_failed") { super(code) }
}

export async function generateContentPackage(
  provider: ContentPackageProvider, repository: ContentPackageRepository,
  input: ContentPackageGenerationRequest & { idempotencyKey: string; requestedBy: string; modelVersion: string; promptVersion: string },
  timeoutMs = 45_000,
): Promise<GeneratedContentPackage> {
  const request = z.object({
    workspaceId: z.string().uuid(), ideaId: z.string().uuid(), ideaTitle: boundedText(3,160),
    ideaPremise: boundedText(10,2_000), requestedBy: z.string().uuid(), idempotencyKey: boundedText(8,128),
    modelVersion: boundedText(1,100), promptVersion: boundedText(1,100),
    evidence: z.array(z.object({ id:z.string().uuid(),title:z.string().nullable(),content:z.string().nullable(),url:z.string().url() }).strict()).min(1).max(25),
  }).strict().safeParse(input);
  if (!request.success || timeoutMs<100 || timeoutMs>60_000) throw new ContentPackageGenerationError("invalid_package_request");
  const controller=new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout=new Promise<never>((_resolve,reject)=>{ timer=setTimeout(()=>{
    controller.abort(); reject(new ContentPackageGenerationError("package_generation_timeout"));
  },timeoutMs); });
  try {
    const { requestedBy,idempotencyKey,modelVersion,promptVersion,...providerInput }=request.data;
    const raw=await Promise.race([provider.generate(providerInput,controller.signal),timeout]);
    const parsed=generatedContentPackageSchema.safeParse(raw);
    if(!parsed.success) throw new ContentPackageGenerationError("invalid_package_output");
    const allowed=new Set(request.data.evidence.map(({id})=>id));
    if(new Set(parsed.data.citations).size!==parsed.data.citations.length
      || parsed.data.citations.some((id)=>!allowed.has(id))) throw new ContentPackageGenerationError("invalid_package_evidence");
    await repository.persist({request:providerInput,idempotencyKey,requestedBy,modelVersion,promptVersion,content:parsed.data});
    return parsed.data;
  } catch(error) {
    if(error instanceof ContentPackageGenerationError) throw error;
    if(controller.signal.aborted) throw new ContentPackageGenerationError("package_generation_timeout");
    throw new ContentPackageGenerationError("package_generation_failed");
  } finally { clearTimeout(timer!); }
}
