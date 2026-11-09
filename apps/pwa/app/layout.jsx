import "./globals.css";
import { brandAssets } from "@imajilearn/shared/assets";

export const metadata = {
  title: "ImajiLearn PWA",
  icons: { icon: brandAssets.mark },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
