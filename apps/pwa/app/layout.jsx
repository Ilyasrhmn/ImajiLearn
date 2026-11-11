import "./globals.css";
import "@fontsource-variable/nunito-sans";

export const metadata = {
  title: { default: "ImajiLearn", template: "%s · ImajiLearn" },
  icons: {
    icon: [
      { url: "/app/icons/imajilearn.svg", type: "image/svg+xml" },
      { url: "/app/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/app/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ImajiLearn", statusBarStyle: "default" },
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fdfaf3" };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
