import "@fontsource-variable/nunito-sans";
import "./globals.css";
import "../components/icon-motion.css";

export const metadata = {
  title: "ImajiLearn",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
