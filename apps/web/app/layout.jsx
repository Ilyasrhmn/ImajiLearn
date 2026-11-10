import "@fontsource-variable/nunito-sans";
import "./globals.css";
import "../components/icon-motion.css";
import { brandAssets } from "@imajilearn/shared/assets";

export const metadata = {
  title: "ImajiLearn",
  icons: { icon: brandAssets.mark },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
