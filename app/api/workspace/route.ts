import {getChatGPTUser} from "../../../platform/identity/session";
import {jsonError} from "../../../platform/storage/papers";
import {workspace} from "../../../composition/workspace";
export async function GET(){
 const user=await getChatGPTUser();if(!user)return jsonError("请先登录",401);
 return Response.json(await workspace.list(user.userId));
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return jsonError("请先登录",401);
 const body=await request.json().catch(()=>({})) as Record<string,unknown>;
 const result=await workspace.savePaper(user.userId,String(body.paperId||""),body.saved!==false);
 return result?Response.json(result):jsonError("论文不存在",404);
}
