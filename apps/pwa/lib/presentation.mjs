// A material keeps its character when sorting, filtering or pinning changes.
export function materialAppearance(id) {
  const value = [...String(id)].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 0) % 4;
  return { kind: ["book", "pencil", "pen", "eraser"][value], tone: `tone-${value}` };
}
