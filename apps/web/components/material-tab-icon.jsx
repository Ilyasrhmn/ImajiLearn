export default function MaterialTabIcon({ kind, pdf }) {
  const art = {
    source: <>
      <path fill="#71614d" d="M9 3h17l7 7v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
      <path fill="#ae9a7c" d="M26 3v7h7Z" />
      {pdf ? <text x="19.5" y="23" fill="#fff9ec" fontSize="10" fontWeight="900" textAnchor="middle">PDF</text>
        : <path d="M13 16h13m-13 5h13m-13 5h8" stroke="#fff9ec" strokeWidth="2" strokeLinecap="round" />}
    </>,
    reading: <>
      <rect x="4" y="4" width="21" height="24" rx="5" fill="#cf8551" />
      <path d="M9 10h11M9 15h11M9 20h8" stroke="#fffaf0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="27.5" cy="23.5" r="9.5" fill="var(--rust)" stroke="var(--material-sheet)" strokeWidth="1.5" />
      <path d="M25 20.8a2.6 2.6 0 0 1 5.1.7c0 2-2.6 2.1-2.6 3.7" fill="none"
        stroke="#fffaf0" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="27.5" cy="28" r=".95" fill="#fffaf0" />
    </>,
    mindmap: <>
      <path d="m19 4 11 6-11 6-11-6Z" fill="#a9d3c9" />
      <path d="m8 10 11 6v13L8 23Z" fill="#579b90" />
      <path d="m19 16 11-6v13l-11 6Z" fill="#31766d" />
      <path d="M7 25c-4 2-3 5 4 6 7 1 17-1 23-4l-3-1m3 1-1 3"
        fill="none" stroke="#31766d" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    slides: <>
      <rect x="2" y="7" width="36" height="22" rx="8" fill="#577a9c" />
      <path d="M17 13.5a1 1 0 0 0-1.5.9v7.2a1 1 0 0 0 1.5.9l6.5-3.6a1 1 0 0 0 0-1.8Z" fill="#fffaf0" />
    </>,
    song: <>
      <path fill="#4d824e" d="M14 10.5a2 2 0 0 1 1.6-2l15-3a2 2 0 0 1 2.4 2v16c0 3.2-2.8 5.5-6.3 5.5-2.8 0-4.7-1.5-4.7-3.8 0-3 3.5-5.3 7-4.8v-8.6l-11 2.2v12.3c0 3.2-2.8 5.7-6.4 5.7C9 32 7 30.5 7 28.2c0-3 3.6-5.4 7-4.9Z" />
      <path d="m16 10 15-3" stroke="#93b88a" strokeWidth="1.3" strokeLinecap="round" />
    </>,
  };
  return <svg viewBox="0 0 40 36" className="material-tab-art" aria-hidden="true" focusable="false">{art[kind]}</svg>;
}
