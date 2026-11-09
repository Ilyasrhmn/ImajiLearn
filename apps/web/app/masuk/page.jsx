import AuthForm from "../../components/auth-form";
import { isGoogleSignInConfigured } from "../../lib/google-sign-in-config.mjs";
import { googleCallbackNotice } from "../../lib/google-auth-client.mjs";
export const metadata = { title: "Masuk" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  return <AuthForm googleEnabled={isGoogleSignInConfigured()} googleNotice={googleCallbackNotice(params?.google)} />;
}
