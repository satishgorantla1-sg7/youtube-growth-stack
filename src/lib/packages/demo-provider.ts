import type { ContentPackageProvider, GeneratedContentPackage } from "./generation";

export class DemoContentPackageProvider implements ContentPackageProvider {
  async generate(input: Parameters<ContentPackageProvider["generate"]>[0],signal:AbortSignal):Promise<GeneratedContentPackage>{
    if(signal.aborted) throw new DOMException("Aborted","AbortError");
    const source=input.evidence[0];
    return {
      titles:[input.ideaTitle,`${input.ideaTitle}: A practical evidence-led guide`].map((value)=>value.slice(0,120)),
      thumbnailConcepts:[{concept:"Evidence versus assumptions",visualDescription:`A clean split-screen visual inspired by ${source.title??source.url}.`,overlayText:"PROOF, NOT HYPE"}],
      hooks:[`What if the strongest answer is already hiding in the evidence behind ${input.ideaTitle}?`],
      outline:[
        {section:"The problem",purpose:"Establish the audience problem and why it matters.",keyPoints:[input.ideaPremise]},
        {section:"The evidence",purpose:"Explain the cited finding without overstating it.",keyPoints:[source.title??source.url]},
        {section:"The action plan",purpose:"Turn the evidence into practical next steps.",keyPoints:["Summarise the finding","Apply it carefully"]},
      ],
      script:`Open with the central question behind ${input.ideaTitle}. Explain the audience problem in plain language, then introduce the evidence from ${source.url}. Separate what the source directly supports from our own analysis. Walk through the practical implications, give the viewer a short action plan, and close by restating the evidence-backed takeaway without promising results the source cannot prove.`,
      citations:[source.id],
    };
  }
}
