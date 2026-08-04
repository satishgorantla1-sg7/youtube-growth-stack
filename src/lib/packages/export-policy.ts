export const contentPackageExportPolicy={enabled:false,requiresApproval:true,reason:"content_export_disabled"} as const;
export function requireContentPackageExportApproval():never {
  throw new Error(contentPackageExportPolicy.reason);
}
