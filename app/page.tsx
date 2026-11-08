import {
  getChatGPTUser,
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "../platform/identity/session";
import AtlasApp from "./components/atlas-app";
import { runtime } from "../platform/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <AtlasApp
      user={user ? { name: user.displayName, id: user.userId } : null}
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
      personalMode={runtime("SELF_HOSTED_PERSONAL_MODE") === "true"}
    />
  );
}
