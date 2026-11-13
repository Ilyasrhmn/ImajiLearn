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

  const results = new Array(chunks.length);
  let cursor = 0;
  let failure;
  async function worker() {
    while (!failure && cursor < chunks.length) {
      const index = cursor++;
      try { results[index] = await generatePart(chunks[index], chunks.length > 1); }
      catch (error) { failure ??= error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, worker));
  if (failure) throw failure;
  const parts = results.flat();
  return parts.length === 1 ? parts[0] : combine(parts, source.title);
}

export async function generateLessonBatch(source, generate, combine, checkpoint) {
  const chunks = checkpoint?.chunks ?? chunksOf(source.text).map(text => ({ text, result: null }));
  const pending = chunks.flatMap((chunk, index) => chunk.result === null ? [index] : []).slice(0, 2);
  const results = await Promise.allSettled(pending.map(index => generate(chunks[index].text, chunks.length > 1)));
  let failure;
  for (let position = results.length - 1; position >= 0; position--) {
    const index = pending[position];
    const result = results[position];
    if (result.status === "fulfilled") chunks[index].result = result.value;
    else if (result.reason.code === "INCOMPLETE_OUTPUT" && chunks[index].text.length > retrySplitFloor) {
      const text = chunks[index].text;
      const boundary = splitAtBoundary(text, Math.floor(text.length / 2));
      chunks.splice(index, 1, { text: text.slice(0, boundary).trimEnd(), result: null },
        { text: text.slice(boundary).trimStart(), result: null });
    } else failure ??= result.reason;
  }
  const state = { chunks };
  const done = chunks.every(chunk => chunk.result !== null);
  const parts = done ? chunks.map(chunk => chunk.result) : null;
  return { state, failure, done, content: done ? parts.length === 1 ? parts[0] : combine(parts, source.title) : null };
}
