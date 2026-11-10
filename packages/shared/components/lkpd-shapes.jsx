import { cubeNet } from "../lib/lkpd.mjs";

export function TemplateShape({ type }) {
  return <svg viewBox="0 0 260 150" fill="none" aria-hidden="true" className={`lkpd-template-shape shape-${type}`}>
    {type === "fold" ? <><rect x="52" y="18" width="156" height="116" rx="5" fill="#fffdf7" stroke="currentColor" /><path d="M130 18v116M52 76h156" stroke="currentColor" strokeDasharray="5 5" /><path d="m60 26 58 8v34l-58 3ZM60 83l58 5v34l-58 4Z" fill="#f7d585" stroke="currentColor" /><path d="m142 34 58-8v45l-58-3Zm0 54 58-5v43l-58-4Z" fill="#cddfc9" stroke="currentColor" /></>
      : type === "cube" ? <>{[[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]].map(([x, y], i) => <rect key={i} x={80 + x * 29} y={16 + y * 29} width="29" height="29" fill={i % 2 ? "#fffdf7" : "#f7d585"} stroke="currentColor" />)}<path d="M109 45h29v58" stroke="currentColor" strokeDasharray="4 3" /></>
        : type === "match" ? <>{[0, 1, 2].map(i => <g key={i}><rect x="30" y={22 + i * 37} width="72" height="28" rx="4" fill={i % 2 ? "#cddfc9" : "#f7d585"} stroke="currentColor" /><path d={`M115 ${36 + i * 37}h28m-6-5 6 5-6 5`} stroke="currentColor" /><rect x="157" y={22 + i * 37} width="72" height="28" rx="4" stroke="currentColor" strokeDasharray="4 3" /></g>)}</>
          : type === "sequence" ? <>{[0, 1, 2, 3].map(i => <g key={i}><rect x={23 + i * 60} y={45 + (i % 2) * 12} width="44" height="51" rx="4" fill={i % 2 ? "#cddfc9" : "#fffdf7"} stroke="currentColor" />{i < 3 && <path d={`M${71 + i * 60} 78h9m-4-4 4 4-4 4`} stroke="currentColor" />}</g>)}</>
            : <>{[0, 1].map(i => <g key={i}><rect x={36 + i * 102} y="26" width="86" height="102" rx="5" stroke="currentColor" /><path d={`M${36 + i * 102} 49h86`} stroke="currentColor" />{[0, 1, 2].map(j => <rect key={j} x={48 + i * 102} y={58 + j * 21} width="62" height="15" rx="2" fill={i ? "#cddfc9" : "#f7d585"} stroke="currentColor" />)}</g>)}</>}
  </svg>;
}

export function CubePattern({ items }) {
  const line = points => points.map(point => point.join(",")).join(" ");
  return <svg viewBox="0 0 120 150" className="lkpd-cube-pattern" role="img" aria-label="Pola kubus dengan enam sisi dan tujuh bidang lem">
    <defs><pattern id="lkpd-glue-hatch" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0 3 3 0" fill="none" stroke="#aaa" strokeWidth=".2" /></pattern></defs>
    {cubeNet.faces.map(face => <g key={face.index}><rect x={face.x} y={face.y} width={face.size} height={face.size} className="lkpd-face" /><foreignObject x={face.x + 2} y={face.y + 3} width="28" height="26"><div xmlns="http://www.w3.org/1999/xhtml" className="lkpd-cube-label">{items[face.index]?.front}</div></foreignObject></g>)}
    {cubeNet.tabs.map((tab, i) => <g key={i}><polygon points={line(tab.points)} fill="url(#lkpd-glue-hatch)" /><polyline points={line(tab.points)} fill="none" stroke="currentColor" strokeWidth=".35" /><polyline points={line(tab.base)} className="lkpd-fold-line" /></g>)}
    {cubeNet.cuts.map((points, i) => <polyline key={i} points={line(points)} fill="none" stroke="currentColor" strokeWidth=".35" />)}
    {cubeNet.folds.map((points, i) => <polyline key={i} points={line(points)} className="lkpd-fold-line" />)}
  </svg>;
}
