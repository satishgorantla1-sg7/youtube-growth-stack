export type SourceType = "youtube" | "web";
export type ResearchSource = {
  provider: "apify" | "firecrawl" | "demo";
  type: SourceType;
  title: string;
  url: string;
  text: string;
  capturedAt: string;
  provenance: Record<string, string | number | boolean>;
};
export interface ResearchProvider {
  readonly name: ResearchSource["provider"];
  isConfigured(): boolean;
  research(query: string, limit: number): Promise<ResearchSource[]>;
}

export class ProviderError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
    this.name = "ProviderError";
  }
}
