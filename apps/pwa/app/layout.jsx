import "./globals.css";

export const metadata = {
  title: "ImajiLearn PWA",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
