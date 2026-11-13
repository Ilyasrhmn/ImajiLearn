import AuthScreen from "../../components/auth-screen";
import { googleCallbackNotice } from "@imajilearn/shared/lib/google-auth-client.mjs";
export const metadata = { title: "Masuk" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  return <AuthScreen googleNotice={googleCallbackNotice(params?.google)} />;
}
