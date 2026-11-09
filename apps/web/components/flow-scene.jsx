const scenes = [
  ["craft", /\b(upcycl\w*|daur ulang|kerajinan|merakit|recycle)\b/i],
  ["wallet", /\b(pencairan|pembayaran|penarikan|saldo|dompet|transaksi|uang)\b/i],
  ["calculate", /\b(perhitungan|menghitung|kalkulasi|insentif|pengukuran|penimbangan)\b/i],
  ["waste", /\b(sampah|limbah|pemilahan|penyetoran|pembuangan)\b/i],
  ["lesson", /\b(edukasi|belajar|pembelajaran|pelajaran|literasi|sosialisasi|membaca)\b/i],
  ["plant", /\b(benih|biji|tunas|tumbuhan|tanaman|fotosintesis|daun|akar|kecambah\w*)\b/i],
  ["water", /\b(air|hujan|awan|penguapan|kondensasi|sungai)\b/i],
  ["transport", /\b(pengiriman|pengangkutan|kendaraan|transportasi|distribusi)\b/i],
  ["digital", /\b(platform|aplikasi|sistem|digital|komputer|website|data)\b/i],
];

function sceneFor({ label, detail }) {
  return (scenes.find(([, pattern]) => pattern.test(label)) ??
    scenes.find(([, pattern]) => pattern.test(detail)))?.[0] ?? "topic";
}

const art = {
  lesson: <>
    <path fill="#8daa8b" d="m23 55 41 10 41-10v12L64 79 23 67z" />
    <path fill="#fff1c9" d="M25 32q23-3 39 10 16-13 39-10v28q-23 0-39 12-16-12-39-12z" />
    <path fill="none" d="M64 42v30M33 42q14 0 24 7M33 49q13 0 24 7m14-7q10-7 24-7m-24 14q10-7 24-7" />
  </>,
  waste: <>
    <path fill="#84a589" d="M30 46h23l-2 29H33z" />
    <path fill="#aec0ac" d="M28 43h27v6H28z" />
    <path fill="#e6ae68" d="M75 46h23l-3 29H78z" />
    <path fill="#f5d09a" d="M73 43h27v6H73z" />
    <path fill="#9db7bf" d="M50 38h28l-3 39H53z" />
    <path fill="#bfd2d6" d="M48 34h32v7H48z" />
    <path fill="none" d="M58 55q1-6 7-6l-2-2m2 2-3 4m8 4q-1 6-7 6l2 2m-2-2 3-4" />
  </>,
  calculate: <>
    <rect x="43" y="23" width="43" height="54" rx="5" fill="#638580" />
    <rect x="48" y="21" width="39" height="52" rx="5" fill="#9db6ad" />
    <rect x="54" y="28" width="27" height="12" rx="2" fill="#fff1c9" />
    <path fill="none" d="M57 47h3m5 0h3m5 0h4m-20 7h3m5 0h3m5 0h4m-20 7h3m5 0h3m5 0h4" />
    <ellipse cx="96" cy="70" rx="11" ry="4" fill="#e3a95f" />
    <ellipse cx="96" cy="66" rx="11" ry="4" fill="#f8d394" />
  </>,
  wallet: <>
    <ellipse cx="76" cy="33" rx="12" ry="13" fill="#e8ae64" />
    <ellipse cx="73" cy="32" rx="10" ry="12" fill="#f8d694" />
    <path fill="none" d="M73 26v12" />
    <path fill="#a96454" d="m30 44 55-6 14 8v26l-62 5-7-6z" />
    <path fill="#d58b72" d="M37 49l62-5v28l-62 5z" />
    <path fill="#f1bea1" d="m101 53-23 2v13l23-2z" />
    <circle cx="85" cy="61" r="2" fill="#243e43" />
  </>,
  craft: <>
    <path fill="#a9c1bd" d="M42 45h45l-5 31H47z" />
    <path fill="#e0e9d9" d="M39 44h51v7H39z" />
    <path fill="#e9b986" d="M47 61q16-6 36 0l-2 15H49z" />
    <path fill="none" d="M65 63V35" />
    <path fill="#82a878" d="M65 45q-17 1-19-15 17-1 19 15m0-5q0-17 16-17 2 16-16 17" />
    <path fill="none" d="m96 34 3 4 5-1m-5 1 2-5m-69 4-4-1-3 4" />
  </>,
  plant: <>
    <path fill="#e7b08f" d="M44 56h40l-6 23H50z" />
    <ellipse cx="64" cy="56" rx="20" ry="6" fill="#ab8263" />
    <path fill="none" d="M64 58V34" />
    <path fill="#8cac75" d="M64 49q-17 1-22-14 17-1 22 14m0-8q0-16 19-20 2 17-19 20" />
  </>,
  water: <>
    <path fill="#e7efea" d="M36 49a10 10 0 0 1 1-20 15 15 0 0 1 28-5 11 11 0 0 1 16 9 8 8 0 0 1 0 16z" />
    <path fill="#9cbcc5" d="M43 57q-10 12 0 13 10-1 0-13m19-4q-10 12 0 13 10-1 0-13m19 8q-10 12 0 13 10-1 0-13" />
  </>,
  transport: <>
    <path fill="#e9b572" d="M24 35h50v31H24z" />
    <path fill="#8fb3a2" d="M74 45h16l14 12v11H74z" />
    <path fill="#e6ede0" d="M80 48h8l9 8H80z" />
    <circle cx="43" cy="70" r="7" fill="#627575" />
    <circle cx="90" cy="70" r="7" fill="#627575" />
  </>,
  digital: <>
    <path fill="#718e8a" d="M32 28h65v38H32zM58 66h13v10H58zM48 76h33v4H48z" />
    <path fill="#e7eee2" d="M37 33h55v28H37z" />
    <path fill="none" d="m45 52 10-10 10 5 15-8" />
  </>,
  topic: <>
    <path fill="#b2c4ad" d="m42 36 27-9 19 10-27 10z" />
    <path fill="#879d86" d="M42 36l19 11v25L42 61z" />
    <path fill="#dce5cf" d="m61 47 27-10v25L61 72z" />
    <path fill="none" d="m67 53 15-6m-15 13 12-4" />
  </>,
};

export default function FlowObject({ step }) {
  const scene = sceneFor(step);
  return <g data-scene={scene} stroke="#243e43" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {art[scene]}
  </g>;
}
