function shortTitle(value, limit) {
  const title = value.trim().replace(/^(?:\d+(?:\.\d+)*|[A-Z])[.)]\s*/u, "")
    .replace(/\s*\([^)]*\)/gu, "").replace(/\s+/gu, " ").trim();
  if (title.length <= limit) return title;
  return (title.slice(0, limit - 3).replace(/\s+\S*$/u, "") || title.slice(0, limit - 3)) + "...";
}

export function sectionLabel(start, end = start) {
  const first = start.split(/\s+\/\s+/u)[0];
  const last = end.split(/\s+\/\s+/u).at(-1);
  if (first === last) return shortTitle(first, 52);
  const beginning = shortTitle(first, 24), ending = shortTitle(last, 24);
  return beginning === ending ? beginning : `${beginning} - ${ending}`;
}
