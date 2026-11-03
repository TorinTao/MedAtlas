import { createCatalogService } from "../modules/catalog/service";
import {
  searchOpenAlex,
  searchPubMed,
  searchArxiv,
} from "../platform/sources/publications";
import { createLexDiscovery } from "../platform/sources/lex-discovery";
import { runtime } from "../platform/config";
import { webReader } from "./providers";
const { searchNatureViaLex, searchEuropePmcViaLex } = createLexDiscovery(
  webReader.extract,
);
const lexReady = () =>
  Boolean(runtime("LEXMOUNT_API_KEY") && runtime("LEXMOUNT_PROJECT_ID"));
export const { collectPapers } = createCatalogService(
  [
    {
      name: "OpenAlex",
      search: searchOpenAlex,
      queryLimit: 20,
      corpusLimit: 50,
    },
    { name: "PubMed", search: searchPubMed, queryLimit: 8, corpusLimit: 15 },
    { name: "arXiv", search: searchArxiv, queryLimit: 8, corpusLimit: 10 },
    {
      name: "Nature · Lexmount",
      search: (q, n) =>
        lexReady() ? searchNatureViaLex(q, n) : Promise.resolve([]),
      queryLimit: 3,
      corpusLimit: 5,
    },
    {
      name: "Europe PMC · Lexmount",
      search: (q, n) =>
        lexReady() ? searchEuropePmcViaLex(q, n) : Promise.resolve([]),
      queryLimit: 8,
      corpusLimit: 12,
    },
  ],
  () =>
    lexReady() ? [] : ["Lexmount Web Fetch 尚未配置，本次只使用结构化接口"],
);
export { searchOpenAlex, searchPubMed, searchArxiv };
export { englishQuery } from "../modules/catalog/query";
export { searchNatureViaLex, searchEuropePmcViaLex };
