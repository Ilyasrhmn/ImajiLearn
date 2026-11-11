const chapter = /^(?:bab|bagian)\s+(?:\d+|[ivxlcdm]+)\b/iu;
const section = /^[A-Z][.)]\s+\S/u;
const caption = /^(?:gambar|figure|fig\.?|diagram|ilustrasi|tabel)\s+\d/iu;
const orderedItem = /^(\d+)[.)]\s+/u;
const bulletItem = /^[•●▪◦*-]\s+/u;
const divider = /^_{4,}$/u;
const formula = /^(?:[A-Z][a-z]?|e|[0-9₀-₉½¼¾+−–=→⇌↔()\s-])+$/u;

export function sourceRows(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => b.height - a.height)) {
    const row = rows.find(row => Math.abs(row.y - item.y) <= 2 || (
      item.height > 0 && item.height < row.height * .8 && Math.abs(row.y - item.y) <= row.height * .6 &&
      row.items.some(base => base.x - 2 <= item.x && base.x + base.width + row.height * .35 >= item.x)
    ));
    if (row) row.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }
  return rows.sort((a, b) => a.y - b.y).map(row => {
    const { items, height, y } = row;
    items.sort((a, b) => a.x - b.x);
    const runs = [];
    let widestGap = 0;
    for (const [index, item] of items.entries()) {
      const previous = items[index - 1];
      const gap = previous ? item.x - previous.x - previous.width : 0;
      widestGap = Math.max(widestGap, gap);
      const shift = y - item.y;
      const script = item.height < height * .8 && Math.abs(shift) > 2 ? (shift > 0 ? "sup" : "sub") : undefined;
      const space = previous && !script && (gap > height * .11 || !/^[,.;:!?)]/u.test(item.text) && gap > height * .065);
      const last = runs.at(-1);
      const text = (space ? " " : "") + item.text;
      if (last && last.bold === item.bold && last.italic === item.italic && last.script === script) last.text += text;
      else runs.push({ text, bold: item.bold, italic: item.italic, script });
    }
    return {
      y, height, runs, text: runs.map(run => run.text).join(""), widestGap,
      x: items[0].x, right: Math.max(...items.map(item => item.x + item.width)),
      top: Math.min(...items.map(item => item.y - item.height)),
    };
  });
}

function formulaRow(row) {
  return row && row.text.length <= 240 && (row.widestGap >= row.height * 1.6 || /[→⇌↔]/u.test(row.text)) &&
    /[A-Z]/u.test(row.text) && formula.test(row.text);
}

export function sourceFormulas(rows) {
  const groups = [];
  for (let i = 0; i < rows.length; i++) {
    if (!formulaRow(rows[i])) continue;
    const group = [rows[i]];
    while (rows[i + 1] && rows[i + 1].y - rows[i].y <= group[0].height * 2.6) {
      const next = rows[i + 1];
      if (!formulaRow(next) && !(divider.test(next.text) && formulaRow(rows[i + 2]))) break;
      group.push(next);
      i++;
    }
    groups.push(group);
  }
  return groups;
}

function withoutMarker(runs, length) {
  const result = [];
  for (const run of runs) {
    if (run.text.length > length) result.push({ ...run, text: run.text.slice(length) });
    length = Math.max(0, length - run.text.length);
  }
  return result;
}

export function sourceBlocks(rows, illustrations, pageHeight) {
  const heights = rows.map(row => row.height).sort((a, b) => a - b);
  const bodyHeight = heights[Math.floor(heights.length / 2)] ?? 0;
  const blocks = [];
  let previous;
  const elements = [...rows, ...illustrations].sort((a, b) => a.y - b.y);
  for (const [index, row] of elements.entries()) {
    if (row.kind) {
      blocks.push(row);
      previous = undefined;
      continue;
    }
    const { text, runs } = row;
    if (/^Bahan Ajar\s*\/.*\s+\d+$/iu.test(text) && (row.y < pageHeight * .12 || row.y > pageHeight * .84)) continue;
    const bold = runs.every(run => run.bold);
    const numbered = orderedItem.exec(text);
    const bullet = bulletItem.exec(text);
    const concise = text.length <= 110 && !/[.!?;]$/u.test(text);
    const last = blocks.at(-1);
    const nextNumber = orderedItem.exec(elements[index + 1]?.text ?? "")?.[1];
    const inNumberedList = numbered && (last?.kind === "ordered-list" || Number(nextNumber) === Number(numbered[1]) + 1);
    const indented = previous && row.x - previous.x > bodyHeight && /^[\p{Lu}]/u.test(text);
    const separated = previous && row.y - previous.y > Math.max(bodyHeight, previous.height, row.height) * 2.65;

    if (caption.test(text)) blocks.push({ kind: "caption", runs });
    else if (concise && chapter.test(text)) blocks.push({ kind: "heading", level: 2, text });
    else if (concise && section.test(text) && (bold || text === text.toUpperCase())) blocks.push({ kind: "heading", level: 3, text });
    else if (concise && bold && !bullet && !inNumberedList) blocks.push({ kind: "heading", level: 4, text });
    else if (concise && row.height > bodyHeight * 1.25 && !numbered && !bullet) blocks.push({ kind: "heading", level: 3, text });
    else if (numbered || bullet) {
      const kind = numbered ? "ordered-list" : "list";
      const item = { value: numbered ? Number(numbered[1]) : undefined, runs: withoutMarker(runs, (numbered ?? bullet)[0].length) };
      if (last?.kind === kind && !separated) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last?.kind === "paragraph" && !separated && !indented) {
      last.runs.push({ text: " " }, ...runs);
    } else if ((last?.kind === "ordered-list" || last?.kind === "list") && !separated && previous && row.x >= previous.x && row.x > (previous.listStart ?? previous.x)) {
      last.items.at(-1).runs.push({ text: " " }, ...runs);
      row.listStart = previous.listStart ?? previous.x;
    } else blocks.push({ kind: "paragraph", runs });

    previous = row;
  }
  return blocks;
}
