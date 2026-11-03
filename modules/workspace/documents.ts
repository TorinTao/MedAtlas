import { PDF_MAX_BYTES, PDF_MAX_PAGES, PDF_MAX_TEXT } from "./pdf-text";
export class DocumentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type UploadRecord = {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  storageKey: string;
  createdAt: string;
};
export interface UploadRepository {
  findOwned(userId: string, id: string): Promise<UploadRecord | undefined>;
  insert(record: UploadRecord): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
}
export interface PrivateFiles {
  put(
    key: string,
    value: Uint8Array | string,
    contentType: string,
  ): Promise<void>;
  get(key: string): Promise<{
    body: BodyInit;
    text(): Promise<string>;
  } | null>;
  delete(key: string): Promise<void>;
}
export async function prepareDocument(
  file: unknown,
  text: string,
  pages: number,
) {
  text = text.trim();
  if (
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.size > PDF_MAX_BYTES ||
    file.size < 100 ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > PDF_MAX_PAGES ||
    text.length < 100 ||
    text.length > PDF_MAX_TEXT
  )
    throw new DocumentError(
      "请上传不超过 20 MB、100 页且可提取 100–200000 字符文字的 PDF",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new DocumentError("文件不是有效 PDF");
  return { bytes, text, pages, fileName: file.name.slice(0, 180) };
}
export function createDocumentService(
  metadata: UploadRepository,
  files: PrivateFiles,
) {
  async function owned(userId: string, id: string) {
    if (!userId) throw new DocumentError("文件不存在或无权访问", 404);
    const row = await metadata.findOwned(userId, id);
    if (!row) throw new DocumentError("文件不存在或无权访问", 404);
    return row;
  }
  async function save(
    userId: string,
    draft: Awaited<ReturnType<typeof prepareDocument>>,
  ) {
    if (!userId) throw new DocumentError("请先登录", 401);
    const id = crypto.randomUUID(),
      storageKey = `users/${encodeURIComponent(userId)}/${id}`;
    const record: UploadRecord = {
      id,
      userId,
      storageKey,
      fileName: draft.fileName,
      fileSize: draft.bytes.length,
      pageCount: draft.pages,
      createdAt: new Date().toISOString(),
    };
    try {
      await files.put(`${storageKey}.pdf`, draft.bytes, "application/pdf");
      await files.put(
        `${storageKey}.txt`,
        draft.text,
        "text/plain; charset=utf-8",
      );
      await metadata.insert(record);
    } catch {
      await Promise.allSettled([
        files.delete(`${storageKey}.pdf`),
        files.delete(`${storageKey}.txt`),
      ]);
      throw new DocumentError("PDF 保存失败，请稍后重试", 503);
    }
    return { id, fileName: record.fileName, pageCount: record.pageCount };
  }
  async function read(
    userId: string,
    id: string,
    kind: "pdf" | "txt" | "analysis.json",
  ) {
    const row = await owned(userId, id),
      object = await files.get(`${row.storageKey}.${kind}`);
    if (!object) throw new DocumentError("文件不存在", 404);
    return { row, object };
  }
  async function remove(userId: string, id: string) {
    const row = await owned(userId, id);
    await Promise.all(
      ["pdf", "txt", "analysis.json"].map((suffix) =>
        files.delete(`${row.storageKey}.${suffix}`),
      ),
    );
    await metadata.remove(userId, id);
  }
  async function saveAnalysis(userId: string, id: string, analysis: unknown) {
    const row = await owned(userId, id);
    await files.put(
      `${row.storageKey}.analysis.json`,
      JSON.stringify(analysis),
      "application/json",
    );
  }
  return { owned, save, read, remove, saveAnalysis };
}
