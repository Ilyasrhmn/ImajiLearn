import { Music2, Presentation, Upload } from "lucide-react";

export default function Icon({ name, size = 22, ...props }) {
  if (name === "song") return <Music2 size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
  if (name === "slides") return <Presentation size={size} strokeWidth={1.8} aria-hidden="true" data-icon={name} {...props} />;
  if (name === "upload") return <Upload size={size} strokeWidth={1.8} aria-hidden="true" data-icon={name} {...props} />;
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    login: <><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path data-icon-part="entry" d="M3 12h12m-5-5 5 5-5 5" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path data-icon-part="needle" d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
    "user-plus": <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2" /><path data-icon-part="plus" d="M19 7v6m-3-3h6" /></>,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    book: (
      <>
        <path d="M12 6c-4-3-9-2-9-2v15s5-1 9 2c4-3 9-2 9-2V4s-5-1-9 2Z" />
        <path d="M12 6v15" />
      </>
    ),
    map: (
      <>
        <rect x="3" y="9" width="6" height="6" rx="2" />
        <rect x="16" y="3" width="5" height="5" rx="1.5" />
        <rect x="16" y="16" width="5" height="5" rx="1.5" />
        <path d="M9 12h4m3-6h-3v12h3" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" />
        <path d="M14 3v5h5M8 12h8m-8 4h6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m8 4 8 8-8 8" />,
    down: <path d="m6 9 6 6 6-6" />,
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      </>
    ),
    full: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    pointer: <path d="m5 3 14 10-7 1-3 7Z" />,
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    "sound-off": <><path d="m11 4-6 5H2v6h3l6 5Zm5 5 6 6m0-6-6 6" /></>,
    logout: (
      <>
        <path d="M9 3H4v18h5m-1-9h13m-5-5 5 5-5 5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6 0 10 7 10 7a21 21 0 0 1-3.2 3.8M6.2 6.2A22 22 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.8-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
      {...props}
    >
      {paths[name] || paths.file}
    </svg>
  );
}
