import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const papers = sqliteTable("papers", { id: text("id").primaryKey(), title: text("title").notNull(), data: text("data").notNull(), updatedAt: text("updated_at").notNull() });
export const savedPapers = sqliteTable("saved_papers", { id: text("id").primaryKey(), userId: text("user_id").notNull(), paperId: text("paper_id").notNull(), createdAt: text("created_at").notNull() });
export const ideas = sqliteTable("ideas", { id: text("id").primaryKey(), userId: text("user_id").notNull(), query: text("query").notNull(), data: text("data").notNull(), createdAt: text("created_at").notNull() });
export const uploads = sqliteTable("uploads", { id: text("id").primaryKey(), userId: text("user_id").notNull(), fileName: text("file_name").notNull(), fileSize: integer("file_size").notNull(), pageCount: integer("page_count").notNull(), storageKey: text("storage_key").notNull(), createdAt: text("created_at").notNull() });
export const usage = sqliteTable("usage", { id: text("id").primaryKey(), count: integer("count").notNull().default(0), updatedAt: text("updated_at").notNull() });
export const jobs = sqliteTable("jobs", { id: text("id").primaryKey(), status: text("status").notNull(), updatedAt: text("updated_at").notNull(), detail: text("detail").notNull().default("") });
