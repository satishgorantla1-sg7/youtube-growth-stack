import {describe,expect,it} from "vitest";
import {contentPackageExportPolicy,requireContentPackageExportApproval} from "./export-policy";
describe("content package export policy",()=>{it("keeps external export disabled and approval-gated",()=>{expect(contentPackageExportPolicy).toEqual({enabled:false,requiresApproval:true,reason:"content_export_disabled"});expect(requireContentPackageExportApproval).toThrow("content_export_disabled")})});
