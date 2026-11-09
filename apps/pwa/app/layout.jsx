import "./globals.css";
import "@fontsource-variable/nunito-sans";
import { brandAssets } from "@imajilearn/shared/assets";

export const metadata = {
  title: { default: "ImajiLearn", template: "%s · ImajiLearn" },
  icons: { icon: brandAssets.mark },
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fdfaf3" };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
