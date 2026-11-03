import type { PDFDocumentProxy } from "pdfjs-dist";
export const PDF_MAX_BYTES = 20000000;
export const PDF_MAX_PAGES = 100;
export const PDF_MAX_TEXT = 200000;
export async function extractPdfText(
  pdf: Pick<PDFDocumentProxy, "numPages" | "getPage">,
): Promise<string> {
  if (
    !Number.isInteger(pdf.numPages) ||
    pdf.numPages < 1 ||
    pdf.numPages > PDF_MAX_PAGES
  )
    throw new Error("暂支持 1–100 页的 PDF");
  const chunks: string[] = [];
  let length = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    try {
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      length += text.length + 1;
      if (length > PDF_MAX_TEXT)
        throw new Error("PDF 文字超过 20 万字符，请拆分文件后上传");
      chunks.push(text);
    } finally {
      page.cleanup();
    }
  }
  const text = chunks.join("\n").trim();
  if (text.length < 100)
    throw new Error(
      "未提取到足够文字；扫描版或图片 PDF 请先进行 OCR，再上传可选择文字的版本",
    );
  return text;
}
