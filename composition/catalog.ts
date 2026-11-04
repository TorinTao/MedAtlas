import type { Paper } from "../shared/models";
import { createCatalogService } from "../modules/catalog/service";
import { createLexFirstCatalog } from "../modules/catalog/lex-first";
import {
  searchOpenAlex,
  searchPubMed,
  searchArxiv,
} from "../platform/sources/publications";
import { createLexDiscovery } from "../platform/sources/lex-discovery";
import { createLexPaperSearch } from "../platform/sources/lex-paper-search";
import { runtime } from "../platform/config";
import { webReader } from "./providers";
const { searchNatureViaLex } = createLexDiscovery(webReader.extract);
const { searchPubMedViaLex, searchEuropePmcViaLex, verify } =
  createLexPaperSearch(webReader);
const primary = createCatalogService([
  {
    name: "PubMed · Lexmount",
    search: searchPubMedViaLex,
    queryLimit: 12,
    corpusLimit: 15,
  },
  {
    name: "Europe PMC · Lexmount",
    search: searchEuropePmcViaLex,
    queryLimit: 12,
    corpusLimit: 15,
  },
]);
const fallback = createCatalogService([
  {
    name: "PubMed 候选元数据",
    search: searchPubMed,
    queryLimit: 12,
    corpusLimit: 15,
  },
  {
    name: "arXiv 候选元数据",
    search: searchArxiv,
    queryLimit: 12,
    corpusLimit: 15,
  },
  {
    name: "OpenAlex 候选元数据",
    search: searchOpenAlex,
    queryLimit: 15,
    corpusLimit: 25,
  },
]);
const pipeline = createLexFirstCatalog({
  primary: primary.collectPapers,
  fallback: fallback.collectPapers,
  verify,
});
export async function collectPapers(
  input: string,
  breadth: "query" | "corpus" = "query",
  accepts?: (paper: Paper) => boolean,
) {
  if (!runtime("LEXMOUNT_API_KEY") || !runtime("LEXMOUNT_PROJECT_ID")) {
    return {
      papers: [],
      sources: [],
      errors: ["Lexmount Web Fetch 尚未配置，无法完成必需的公开页面核验"],
    };
  }
  return pipeline.collectPapers(input, breadth, accepts);
}
export {
  searchOpenAlex,
  searchPubMed,
  searchArxiv,
  searchNatureViaLex,
  searchEuropePmcViaLex,
};
export { englishQuery } from "../modules/catalog/query";
