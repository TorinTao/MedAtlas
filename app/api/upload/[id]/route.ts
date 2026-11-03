import { getChatGPTUser } from "../../../../platform/identity/session";
import { jsonError } from "../../../../platform/storage/papers";
import { documents } from "../../../../composition/workspace";
import { DocumentError } from "../../../../modules/workspace/documents";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getChatGPTUser(),
      text = new URL(request.url).searchParams.has("text");
    const { row, object } = await documents.read(
      user?.userId || "",
      (await context.params).id,
      text ? "txt" : "pdf",
    );
    return new Response(object.body, {
      headers: {
        "Content-Type": text ? "text/plain; charset=utf-8" : "application/pdf",
        "Content-Disposition": text
          ? "inline"
          : `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(
      (error as Error).message,
      error instanceof DocumentError ? error.status : 503,
    );
  }
}
export async function DELETE(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getChatGPTUser();
    await documents.remove(user?.userId || "", (await context.params).id);
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(
      (error as Error).message,
      error instanceof DocumentError ? error.status : 503,
    );
  }
}
