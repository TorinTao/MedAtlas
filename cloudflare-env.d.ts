declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LEXMOUNT_API_KEY?: string;
    LEXMOUNT_PROJECT_ID?: string;
    LEXMOUNT_BASE_URL?: string;
    DEEPSEEK_API_KEY?: string;
    OPENALEX_API_KEY?: string;
    GITHUB_TOKEN?: string;
    REFRESH_TOKEN?: string;
  }
}
