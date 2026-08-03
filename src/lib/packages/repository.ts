import { z } from "zod";
import type { ContentPackageRepository } from "./generation";

type RpcResult={data:unknown;error:{message?:string;code?:string}|null};
export type PackageRpcClient={rpc(name:string,args:Record<string,unknown>):Promise<RpcResult>};
const packageResult=z.object({packageId:z.string().uuid(),workspaceId:z.string().uuid(),ideaId:z.string().uuid(),version:z.number().int().positive(),state:z.string(),created:z.boolean().optional()}).passthrough();
export class ContentPackageRepositoryError extends Error {
  constructor(readonly code:"approved_idea_required"|"content_package_forbidden"|"content_package_conflict"|"content_package_unavailable"){super(code)}
}
function mapped(error:RpcResult["error"]){
  const message=error?.message??"";
  if(message.includes("approved_idea_required")) return new ContentPackageRepositoryError("approved_idea_required");
  if(message.includes("forbidden")) return new ContentPackageRepositoryError("content_package_forbidden");
  if(message.includes("idempotency_conflict")) return new ContentPackageRepositoryError("content_package_conflict");
  return new ContentPackageRepositoryError("content_package_unavailable");
}
export class SupabaseContentPackageRepository implements ContentPackageRepository {
  constructor(private readonly client:PackageRpcClient){}
  async persist(input:Parameters<ContentPackageRepository["persist"]>[0]){
    const {data,error}=await this.client.rpc("create_content_package_version",{
      target_workspace_id:input.request.workspaceId,target_idea_id:input.request.ideaId,target_requested_by:input.requestedBy,
      request_idempotency_key:input.idempotencyKey,request_model_version:input.modelVersion,
      request_prompt_version:input.promptVersion,generated_package:input.content,
    });
    if(error) throw mapped(error);
    const parsed=packageResult.safeParse(data);
    if(!parsed.success) throw new ContentPackageRepositoryError("content_package_unavailable");
    return parsed.data;
  }
}
