import { createDocumentService } from "../modules/workspace/documents";
import { uploadRepository, privateFiles } from "../platform/storage/uploads";
export const documents = createDocumentService(uploadRepository, privateFiles);
import { createWorkspaceService } from "../modules/workspace/saved-items";
import { savedItemsRepository } from "../platform/storage/saved-items";
import { paperRepository } from "./providers";
export const workspace = createWorkspaceService(
  savedItemsRepository,
  paperRepository,
);

import { createPaperLinkImporter } from "../modules/workspace/paper-link";
import { deepseekJson, webReader } from "./providers";
import { summarizePaperZh, translateAbstractZh } from "./research";
export const importPaperLink = createPaperLinkImporter({
  web: webReader,
  model: deepseekJson,
  papers: paperRepository,
  items: savedItemsRepository,
  enrich: async (paper) => {
    const results = await Promise.allSettled([
      summarizePaperZh(paper),
      translateAbstractZh(paper),
    ]);
    const warnings: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") paper = { ...paper, ...result.value };
      else warnings.push("部分中文解读暂未完成，可在文献详情重试");
    }
    return { paper, warnings: [...new Set(warnings)] };
  },
});
