/* eslint-disable @next/next/no-img-element */
import { lkpdAssets } from "../lib/lkpd.mjs";
import { CubePattern } from "./lkpd-shapes";

function ItemFront({ item, ink = false }) {
  const asset = lkpdAssets[item.assetId];
  return asset ? <img className="lkpd-card-image" src={ink ? asset.inkSrc : asset.src} alt={asset.label} /> : <span>{item.front}</span>;
}
function Paper({ document, title, children, identity = true }) {
  return <article className="lkpd-paper" aria-label={title}>
    <header className="lkpd-paper-heading"><h2>{document.content.title}</h2><p>{title}</p></header>
    {identity && <div className="lkpd-identity"><span>Nama: <i /></span><span>Kelas: {document.grade || <i />}</span></div>}
    <div className="lkpd-paper-instructions">{document.content.instructions.map((instruction, i) => <p key={i}>{instruction}</p>)}</div>
    {children}
  </article>;
}
function Legend({ glue = false }) {
  return <div className="lkpd-pattern-legend"><span><i className="cut" />Potong</span><span><i className="fold" />Lipat</span>{glue && <span><i className="glue" />Lem</span>}<span className="lkpd-measure"><i />30 mm</span></div>;
}
export default function LkpdPages({ document, view = "student" }) {
  const { content, templateId } = document;
  const itemsById = Object.fromEntries(content.items.map(item => [item.id, item]));
  const cuts = document.displayOrder.map(id => itemsById[id]);
  if (view === "teacher") return <div className={`lkpd-pages theme-${document.theme}`} data-print-document="teacher">
    <Paper document={document} title="Panduan guru" identity={false}>
      <section className="lkpd-guide-section"><h3>Persiapan</h3><ul>{content.teacher.preparation.map((step, i) => <li key={i}>{step}</li>)}</ul></section>
      <section className="lkpd-guide-section"><h3>{templateId === "cube" ? "Isi sisi kubus" : "Panduan jawaban"}</h3>
        <ol>{(templateId === "sequence" ? content.order.map(id => itemsById[id]) : content.items).map(item => <li key={item.id}><strong>{item.front || "Sisi tanpa label"}</strong>{templateId === "match" ? ` — ${content.pairs.find(pair => pair.itemId === item.id).target}` : templateId === "group" ? ` — ${content.groups.find(group => group.itemIds.includes(item.id)).label}` : item.back ? ` — ${item.back}` : ""}</li>)}</ol>
      </section>
      {content.teacher.notes && <section className="lkpd-guide-section"><h3>Catatan pengamatan</h3><p>{content.teacher.notes}</p><div className="lkpd-observation-lines" /></section>}
      {content.items.some(item => item.assetId) && <p className="lkpd-asset-credit">Gambar simbol Pancasila: Gunawan Kartapranata / Wikimedia Commons, domain publik.</p>}
    </Paper>
  </div>;
  return <div className={`lkpd-pages theme-${document.theme}`} data-print-document="student">
    {templateId === "cube" ? <Paper document={document} title="Pola kubus"><CubePattern items={content.items} /><Legend glue /></Paper>
      : templateId === "fold" ? <>
        <Paper document={document} title="Alas buku lipat"><div className="lkpd-fold-grid">{content.items.map(item => <div className="lkpd-fold-base" key={item.id}><span className="lkpd-glue-zone">Lem</span><div><p>{item.back}</p></div></div>)}</div></Paper>
        <Paper document={document} title="Tutup jendela"><div className="lkpd-fold-grid">{content.items.map(item => <div className="lkpd-fold-cover" key={item.id}><span className="lkpd-glue-zone">Lem</span><div><ItemFront item={item} ink={document.theme === "ink"} /></div></div>)}</div><Legend glue /></Paper>
      </>
        : <>
          <Paper document={document} title={templateId === "match" ? "Pasangkan potongan" : templateId === "sequence" ? "Susun tahapannya" : "Kelompokkan kartu"}>
            {templateId === "match" ? <div className="lkpd-match-targets">{content.pairs.map(pair => <div className="lkpd-match-target" key={pair.itemId}><p>{pair.target}</p><div className="lkpd-paste-slot" /></div>)}</div>
              : templateId === "sequence" ? <div className="lkpd-sequence-targets">{content.items.map((item, i) => <div className="lkpd-sequence-slot" key={item.id}><span>{i + 1}</span><div className="lkpd-paste-slot" /></div>)}</div>
                : <div className={`lkpd-group-targets groups-${content.groups.length}`}>{content.groups.map(group => <section key={group.id}><h3>{group.label}</h3>{group.itemIds.map(id => <div className="lkpd-group-slot" key={id} />)}</section>)}</div>}
          </Paper>
          <Paper document={document} title="Potongan kartu"><div className={`lkpd-cut-cards ${templateId === "group" ? "group-cards" : ""}`}>{cuts.map(item => <div className="lkpd-cut-card" key={item.id}><ItemFront item={item} ink={document.theme === "ink"} /></div>)}</div><div className="lkpd-cut-instruction">Gunting mengikuti garis luar setiap kartu.</div></Paper>
        </>}
  </div>;
}
