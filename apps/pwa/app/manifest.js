export default function manifest() {
  return {
    id: "/app/",
    name: "ImajiLearn",
    short_name: "ImajiLearn",
    lang: "id",
    start_url: "/app/beranda",
    scope: "/app/",
    display: "standalone",
    background_color: "#fdfaf3",
    theme_color: "#fdfaf3",
    icons: [
      ...[192, 512].map(size => ({
        src: `/app/icons/imajilearn-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "any",
      })),
      {
        src: "/app/icons/imajilearn-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
