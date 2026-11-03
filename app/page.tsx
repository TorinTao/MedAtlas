import {
  getChatGPTUser,
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "../platform/identity/session";
import AtlasApp from "./components/atlas-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <AtlasApp
      user={user ? { name: user.displayName } : null}
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
