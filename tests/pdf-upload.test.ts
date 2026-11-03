import assert from "node:assert/strict";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPdfText } from "../modules/workspace/pdf-text";

// Synthetic document; no user PDF or research data is used in these checks.
export function fixturePdf(pageCount = 2, withText = true): Uint8Array {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < pageCount; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    const stream = withText ? `BT /F1 11 Tf 40 740 Td (MedAtlas synthetic upload check page ${i + 1}. This file tests text extraction, private storage and deletion. It contains no patient data or clinical claims.) Tj ET` : "";
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

test("real PDF parser extracts both pages of a valid document", async () => {
  const task = getDocument({ data: fixturePdf() });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    const text = await extractPdfText(pdf);
    assert.match(text, /page 1/); assert.match(text, /page 2/);
    assert.ok(text.length >= 100);
  } finally { await task.destroy(); }
});

test("image-only or blank PDFs give an actionable OCR error", async () => {
  const task = getDocument({ data: fixturePdf(1, false) });
  try { await assert.rejects(extractPdfText(await task.promise), /OCR/); }
  finally { await task.destroy(); }
});

test("documents above the page limit are rejected before text extraction", async () => {
  const task = getDocument({ data: fixturePdf(101) });
  try { await assert.rejects(extractPdfText(await task.promise), /100 页/); }
  finally { await task.destroy(); }
});

test("invalid PDF fails but a subsequent valid file still parses", async () => {
  const bad = getDocument({ data: new TextEncoder().encode("This is not a PDF document") });
  try { await assert.rejects(bad.promise); } finally { await bad.destroy(); }
  const good = getDocument({ data: fixturePdf(1) });
  try { assert.ok((await extractPdfText(await good.promise)).length >= 100); }
  finally { await good.destroy(); }
});
