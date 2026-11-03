import { createIdeasService } from "../modules/ideas/service";
import { createReadingService } from "../modules/reading/service";
import { createSummaryService } from "../modules/reading/summary";
import { europePmcText } from "../platform/sources/europe-pmc";
import { deepseekJson, webReader } from "./providers";
export const {
  makeResearchFocus,
  makeFollowupQueries,
  makeResearchBrief,
  makeIdea,
} = createIdeasService(deepseekJson);
export type { ResearchBrief } from "../modules/ideas/service";
export const { readPaper } = createReadingService({
  model: deepseekJson,
  web: webReader,
  fullText: europePmcText,
});
export const { summarizePaperZh, translateAbstractZh } =
  createSummaryService(deepseekJson);
