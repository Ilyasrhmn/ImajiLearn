import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check } from "lucide-react";
import { studioRequest } from "../lib/studio-api.mjs";
import { sectionLabel } from "../lib/material-section-label.mjs";

const sectionCache = new Map();

export default forwardRef(function SectionPicker({ teacherId, parentId, onChoose, onError, current, visiblePage, manualDefault = false, onCreate, creating = false }, ref) {
  const list = useRef(null);
  const cacheKey = teacherId + ":" + parentId;
  const [data, setData] = useState(() => sectionCache.get(cacheKey) ?? null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [manual, setManual] = useState(manualDefault);
  const [pageRange, setPageRange] = useState({ first: String(current?.first ?? 1), last: String(current?.last ?? "") });
  const form = useRef(null);
  const pending = useRef(null);
  const confirmed = useRef(null);
  const confirmedSequence = useRef(0);
  const sequence = useRef(0);
  const alive = useRef(true);
  const applying = useRef(false);
  const autoSave = useRef(null);
  const [busy, setBusy] = useState(false);
  const path = `/materials/${parentId}/sections`;

  useEffect(() => {
    const controller = new AbortController();
    studioRequest(teacherId, path, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        if (sectionCache.size >= 16) sectionCache.delete(sectionCache.keys().next().value);
        sectionCache.set(cacheKey, result.data);
        setData(result.data);
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [teacherId, path, cacheKey]);

  async function select(ranges, navigate = true, keepManual = false) {
    const key = ranges.map(({ first, last }) => first + "-" + last).sort().join(",");
    if (pending.current?.key === key) return pending.current.promise;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    const promise = (async () => {
      await Promise.resolve();
      try {
        let sectionId = parentId;
        if (ranges.length !== 1 || ranges[0].first !== 1 || ranges[0].last !== data.pages) {
          const query = new URLSearchParams(ranges.map(({ first, last }) => ["range", `${first}-${last}`]));
          const result = await studioRequest(teacherId, `${path}?${query}`, { method: "POST" });
          sectionId = result.data.id;
        }
        if (!alive.current) return null;
        if (request > confirmedSequence.current) {
          confirmed.current = ranges;
          confirmedSequence.current = request;
        }
        if (request !== sequence.current) return null;
        if (navigate && !applying.current) onChoose(sectionId, { manual: keepManual });
        return sectionId;
      } catch (failure) {
        if (!alive.current || request !== sequence.current) return null;
        setDraft(confirmed.current);
        if (keepManual) {
          setManual(false);
          setPageRange({ first: String(current?.first ?? 1), last: String(current?.last ?? data?.pages ?? "") });
        }
        if (onError) onError(failure.message);
        else setError(failure.message);
        return null;
      } finally {
        if (request === sequence.current) {
          pending.current = null;
          if (alive.current) setBusy(false);
        }
      }
    })();
    pending.current = { key, promise };
    return promise;
  }

  const activeIndex = data && visiblePage !== undefined
    ? data.sections.findIndex(({ first, last }) => visiblePage >= first && visiblePage <= last) + 1
    : -1;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(autoSave.current); };
  }, []);

  useImperativeHandle(ref, () => ({
    async apply() {
      clearTimeout(autoSave.current);
      applying.current = true;
      try {
        if (!form.current?.reportValidity()) return null;
        if (!draft) return current ? undefined : parentId;
        if (!draft.length) { setError("Pilih bagian materi."); return null; }
        if (draft.some(range => range.last < range.first)) {
          setError("Halaman akhir harus sama dengan atau setelah halaman awal.");
          return null;
        }
        return await select(draft, false) ?? null;
      } finally { applying.current = false; }
    },
  }));

  useEffect(() => {
    const item = list.current?.querySelector("[data-reading-page]");
    const sidebar = list.current?.closest(".material-source-sidebar");
    if (!item || !sidebar || sidebar.scrollHeight <= sidebar.clientHeight) return;
    const row = item.getBoundingClientRect();
    const rail = sidebar.getBoundingClientRect();
    if (row.top < rail.top) sidebar.scrollTop += row.top - rail.top;
    else if (row.bottom > rail.bottom) sidebar.scrollTop += row.bottom - rail.bottom;
  }, [activeIndex]);

  if (!data) return error ? <p role="alert" className="source-error">{error}</p> : <p role="status">Memuat bagian…</p>;
  const entries = [{ title: "Seluruh materi", first: 1, last: data.pages }, ...data.sections];
  const keyOf = ({ first, last }) => `${first}-${last}`;
  const saved = current?.pages?.length ? current.pages.reduce((ranges, page) => {
    const last = ranges.at(-1);
    if (last?.last === page - 1) last.last = page;
    else ranges.push({ first: page, last: page });
    return ranges;
  }, []) : current ? [current] : [entries[0]];
  const selectedRanges = draft ?? saved.flatMap(range => {
    const covered = data.sections.filter(section => section.first >= range.first && section.last <= range.last);
    return covered.reduce((count, part) => count + part.last - part.first + 1, 0) === range.last - range.first + 1 && current ? covered : [range];
  });
  for (const range of selectedRanges) {
    if (!manual && !entries.some(entry => keyOf(entry) === keyOf(range))) entries.push({ title: "Pilihan halaman", ...range });
  }
  function toggle(range, whole) {
    clearTimeout(autoSave.current);
    setManual(false);
    setError("");
    const rest = selectedRanges.filter(entry => keyOf(entry) !== keyOf(entries[0]) && keyOf(entry) !== keyOf(range));
    const next = whole ? [entries[0]] : selectedRanges.some(entry => keyOf(entry) === keyOf(range)) ? rest : [...rest, range];
    setDraft(next);
    sequence.current++;
    pending.current = null;
    setBusy(false);
    if (next.length) void select(next);
    else confirmed.current = [];
  }

  function editPages(next) {
    clearTimeout(autoSave.current);
    sequence.current++;
    pending.current = null;
    setBusy(false);
    setPageRange(next);
    const range = { first: Number(next.first), last: Number(next.last || data.pages) };
    setDraft([range]);
    setError("");
    if (range.first >= 1 && range.last >= range.first && range.last <= data.pages && next.first && next.last) {
      autoSave.current = setTimeout(() => {
        if (form.current?.querySelector(".source-page-range")?.contains(document.activeElement)) return;
        void select([range], true, true);
      }, 700);
    }
  }
  return <form ref={form} className="source-section-picker" aria-busy={busy || creating} onSubmit={event => {
    event.preventDefault();
    if (onCreate) onCreate();
    else if (draft?.length) void select(draft, true, manual);
  }}>
    <ul aria-label="Bagian materi" ref={list}>{entries.map(({ title, first, last, pageGroup, unavailable }, index) => {
      const selected = selectedRanges.some(entry => entry.first === first && entry.last === last);
      const viewing = activeIndex === index;
      return <li key={title + first}>
        <button type="button" disabled={creating || unavailable} aria-pressed={selected}
          aria-current={viewing ? "location" : undefined} data-reading-page={viewing ? "" : undefined}
          onClick={() => toggle({ first, last }, index === 0)}>
          <span className="source-section-mark" aria-hidden="true">{selected && <Check size={13} strokeWidth={2.5} />}</span>
          <span>{sectionLabel(title)}{!pageGroup && <small>Hlm. {first} - {last}</small>}
            {unavailable && <small>Halaman ini melebihi 40.000 karakter.</small>}</span>
        </button>
      </li>;
    })}</ul>
    <button type="button" className="source-section-manual" aria-expanded={manual} onClick={() => {
      if (manual) { clearTimeout(autoSave.current); setManual(false); }
      else {
        setManual(true);
        editPages({ first: String(current?.first ?? 1), last: String(current?.last ?? data.pages) });
      }
    }}>Pilih halaman</button>
    {manual && <div className="source-page-range" onBlur={event => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      clearTimeout(autoSave.current);
      if (form.current?.checkValidity() && draft?.length) void select(draft, true, true);
    }}>
      <label>Dari<input name="first" type="number" min="1" max={data.pages} value={pageRange.first}
        disabled={creating} onChange={event => editPages({ ...pageRange, first: event.target.value })} required /></label>
      <label>Sampai<input name="last" type="number" min={Number(pageRange.first) || 1} max={data.pages} value={pageRange.last}
        disabled={creating} onChange={event => editPages({ ...pageRange, last: event.target.value })} required /></label>
    </div>}
    {onCreate && <button type="submit" className="source-secondary source-section-create"
      disabled={creating || !selectedRanges.length}>{creating ? "Memuat…" : "Buat media"}</button>}
    {error && <p role="alert" className="source-error">{error}</p>}
  </form>;
});
