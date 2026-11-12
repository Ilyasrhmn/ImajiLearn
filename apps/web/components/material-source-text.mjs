const headingPrefix = /^(?:bab|bagian|subbab)\s+(?:\d+|[ivx]+)\b/iu;
const bullet = /^(?:([0-9]+)[.)]|[•●▪◦*-])\s+(.+)/u;
const caption = /^(?:gambar|figure|fig\.?|diagram|ilustrasi|tabel)\s+\d/iu;

export function formatSourceText(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];

  function flush() {
    if (paragraph.length) blocks.push({ kind: "paragraph", runs: [{ text: paragraph.join("\n") }] });
    paragraph = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const markedHeading = /^(#{1,4})\s+(.+)$/u.exec(line);
    const concise = line.length <= 85 && !/[.!?;]$/u.test(line);
    const chapter = headingPrefix.test(line);
    if (markedHeading || (concise && (chapter || /^[A-Z][.)]\s+[A-Z][A-Z\s]+$/u.test(line)))) {
      flush();
      const level = markedHeading ? Math.max(2, markedHeading[1].length) : chapter ? 2 : 3;
      blocks.push({ kind: "heading", level, text: markedHeading?.[2] ?? line });
      continue;
    }
    if (caption.test(line)) {
      flush();
      blocks.push({ kind: "caption", runs: [{ text: line }] });
      continue;
    }
    const bulletItem = bullet.exec(line);
    if (bulletItem) {
      flush();
      const kind = bulletItem[1] ? "ordered-list" : "list";
      if (blocks.at(-1)?.kind !== kind) blocks.push({ kind, items: [] });
      blocks.at(-1).items.push({ value: bulletItem[1] ? Number(bulletItem[1]) : undefined, runs: [{ text: bulletItem[2] }] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
