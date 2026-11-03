import { createDeepSeekModel } from "../platform/ai/deepseek";
import { createLexmountReader } from "../platform/web/lexmount";
import { resolveDeepSeekKey } from "../platform/identity/model-credentials";
import { runtime } from "../platform/config";
import { allPapers, findPaper, putPapers } from "../platform/storage/papers";
import type { PaperRepository } from "../shared/ports";
export const deepseekJson = createDeepSeekModel(resolveDeepSeekKey);
export const webReader = createLexmountReader(() => ({
  key: runtime("LEXMOUNT_API_KEY"),
  projectId: runtime("LEXMOUNT_PROJECT_ID"),
  baseUrl: runtime("LEXMOUNT_BASE_URL"),
}));
export const lexmountExtract = webReader.extract,
  lexmountDumpDom = webReader.dumpDom;
export const paperRepository: PaperRepository = {
  all: allPapers,
  find: findPaper,
  put: putPapers,
};
