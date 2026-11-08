declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LEXMOUNT_API_KEY?: string;
    LEXMOUNT_PROJECT_ID?: string;
    LEXMOUNT_BASE_URL?: string;
    DEEPSEEK_API_KEY?: string;
    USER_API_KEY_ENCRYPTION_KEY?: string;
    OPENALEX_API_KEY?: string;
    GITHUB_TOKEN?: string;
    REFRESH_TOKEN?: string;
    SUMMARY_BACKFILL_TOKEN?: string;
    MCP_OWNER_EMAIL?: string;
    MIGRATION_EXPORT_TOKEN?: string;
    MIGRATION_EXPORT_UNTIL?: string;
    SELF_HOSTED_PERSONAL_MODE?: string;
  }
}
