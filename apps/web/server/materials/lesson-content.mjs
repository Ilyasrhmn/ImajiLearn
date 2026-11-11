const targetChunkLength = 4500;
const retrySplitFloor = 650;

function splitAtBoundary(text, target) {
  const start = Math.floor(target * .65);
  const window = text.slice(start, target);
  const paragraph = window.lastIndexOf("\n");
  if (paragraph >= 0) return start + paragraph + 1;
  const sentence = [...window.matchAll(/[.!?]\s+/gu)].at(-1);
  if (sentence) return start + sentence.index + sentence[0].length;
  const space = window.lastIndexOf(" ");
  if (space >= 0) return start + space + 1;
  const previous = text.charCodeAt(target - 1);
  return previous >= 0xd800 && previous <= 0xdbff ? target - 1 : target;
}

function chunksOf(text) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > targetChunkLength) {
    const boundary = splitAtBoundary(remaining, targetChunkLength);
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function generateLessonParts(source, generate, combine, renew) {
  const chunks = chunksOf(source.text);

  async function generatePart(text, isPartial) {
    if (isPartial) await renew();
    try {
      return [await generate(text, isPartial)];
    } catch (error) {
      if (error.code !== "INCOMPLETE_OUTPUT" || text.length <= retrySplitFloor) throw error;
      const boundary = splitAtBoundary(text, Math.floor(text.length / 2));
      const first = await generatePart(text.slice(0, boundary).trimEnd(), true);
      const second = await generatePart(text.slice(boundary).trimStart(), true);
      return [...first, ...second];
    }
  }

  const parts = [];
  for (const chunk of chunks) parts.push(...await generatePart(chunk, chunks.length > 1));
  return parts.length === 1 ? parts[0] : combine(parts, source.title);
}
