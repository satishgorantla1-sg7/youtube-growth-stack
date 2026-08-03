import type { GeneratedIdea, IdeaGenerationProvider } from "./generation";

export class DemoIdeaGenerationProvider implements IdeaGenerationProvider {
  async generate(input: Parameters<IdeaGenerationProvider["generate"]>[0], signal: AbortSignal): Promise<GeneratedIdea[]> {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return input.evidence.slice(0, Math.min(input.maxIdeas, 3)).map((source, index) => ({
      title: `Evidence-led idea ${index + 1}: ${source.title ?? "Untitled source"}`.slice(0, 160),
      premise: `Build a practical YouTube video from the verified findings in ${source.url}.`,
      demandScore: 70 - index * 3,
      demandReason: "Demo demand score derived deterministically from evidence order.",
      relevanceScore: 80 - index * 2,
      relevanceReason: "The source belongs to the selected completed research run.",
      competitionScore: 45 + index * 2,
      competitionReason: "Demo competition is explicitly synthetic and not a platform metric.",
      confidenceScore: 75 - index * 2,
      confidenceReason: "Confidence reflects the presence of a directly cited source.",
      evidenceSourceIds: [source.id],
    }));
  }
}
