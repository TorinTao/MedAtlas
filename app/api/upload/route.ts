import { getChatGPTUser } from "../../../platform/identity/session";
import { jsonError, takeQuota } from "../../../platform/storage/papers";
import { documents } from "../../../composition/workspace";
import { DocumentError,prepareDocument } from "../../../modules/workspace/documents";

export async function POST(request:Request) {
 const user=await getChatGPTUser();if(!user)return jsonError("请先登录后上传 PDF",401);
 try {
  const form=await request.formData().catch(()=>null);
  const draft=await prepareDocument(form?.get("file"),String(form?.get("text")||""),Number(form?.get("pages")||0));
  if(!await takeQuota(request,"upload",5,user.userId))return jsonError("今日上传次数已用完",429);
  return Response.json(await documents.save(user.userId,draft));
 } catch(error){return jsonError((error as Error).message,error instanceof DocumentError?error.status:503)}
}
