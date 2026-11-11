const names = {
  pencil: "Pensil",
  pen: "Pulpen",
  eraser: "Penghapus",
  book: "Buku",
  correction: "Tipe-x",
};

function Face({ x = 100, y = 130, mood = "happy" }) {
  return (
    <g className="character-face">
      <ellipse cx={x - 19} cy={y} rx="11" ry="15" fill="white" stroke="none" />
      <ellipse cx={x + 19} cy={y} rx="11" ry="15" fill="white" stroke="none" />
      <ellipse
        cx={x - 17 + (mood === "think" ? -4 : 0)}
        cy={y + 2}
        rx="5.5"
        ry="8"
        fill="#263D48"
        stroke="none"
      />
      <ellipse
        cx={x + 21 + (mood === "think" ? -4 : 0)}
        cy={y + 2}
        rx="5.5"
        ry="8"
        fill="#263D48"
        stroke="none"
      />
      <circle cx={x - 31} cy={y + 20} r="6" fill="#ED917C" stroke="none" />
      <circle cx={x + 31} cy={y + 20} r="6" fill="#ED917C" stroke="none" />
      {mood === "think" ? (
        <ellipse
          cx={x + 3}
          cy={y + 28}
          rx="6"
          ry="8"
          fill="#263D48"
          stroke="none"
        />
      ) : mood === "calm" ? (
        <path d={`M${x - 8} ${y + 28}q8 6 16 0`} fill="none" />
      ) : (
        <path d={`M${x - 13} ${y + 24}q13 23 26 0Z`} fill="#263D48" />
      )}
      <path
        className="smile-on-hover"
        d={`M${x - 10} ${y - 24}q-6-5-12 0M${x + 10} ${y - 24}q6-5 12 0`}
        fill="none"
      />
    </g>
  );
}
export function Mascot({
  kind = "book",
  mood = "happy",
  className = "",
}) {
  const ink = "#263D48";
  return (
    <svg
      className={`mascot mascot-${kind} ${className}`}
      viewBox="0 0 200 270"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${names[kind]}, teman belajar`}
    >
      <g
        stroke={ink}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "pencil" && (
          <>
            <g className="character-arm arm-left">
              <path d="M68 134Q38 138 30 111" />
              <path d="m29 113-5-11m8 8 1-13m0 16 9-7" />
            </g>
            <g className="character-arm arm-right">
              <path d="M130 135q29-6 34-35m-4 6-5-11m8 9 7-11" />
            </g>
            <path d="m77 220-8 25m46-25 10 25" />
            <ellipse cx="64" cy="249" rx="18" ry="9" fill={ink} />
            <ellipse cx="131" cy="249" rx="18" ry="9" fill={ink} />
            <path d="M68 64h64v133l-32 39-32-39Z" fill="#F4CE70" />
            <path d="M68 197h64l-32 39Z" fill="#F3DEB2" />
            <path d="m91 225 9 11 10-11" fill={ink} />
            <path d="M89 74v102m22-102v102" stroke="#D4A74B" strokeWidth="2" />
            <path d="M68 38q0-14 14-14h36q14 0 14 14v22H68Z" fill="#EC928E" />
            <path d="M66 54h68v18H66Z" fill="#FFF4D7" />
            <Face y={124} mood={mood} />
          </>
        )}
        {kind === "pen" && (
          <>
            <g className="character-arm arm-left">
              <path d="M70 140q-28-8-25-38m-2 5-7-8m11 5 6-10" />
            </g>
            <path d="M129 146q20 14 26-3" />
            <path d="m82 221-5 23m40-23 8 23" />
            <ellipse cx="71" cy="249" rx="17" ry="9" fill={ink} />
            <ellipse cx="131" cy="249" rx="17" ry="9" fill={ink} />
            <rect
              x="68"
              y="75"
              width="64"
              height="144"
              rx="25"
              fill="#83A9D2"
            />
            <path d="M73 199h54l-27 34Z" fill="#FFF0CE" />
            <path d="m95 226 5 7 5-7" fill={ink} />
            <rect x="62" y="23" width="76" height="72" rx="20" fill="#628DBB" />
            <path d="M121 32v45q0 9 10 7" stroke="#FFF3D8" strokeWidth="7" />
            <path d="M64 87h72v13H64Z" fill="#F5D778" />
            <Face y={141} mood={mood} />
          </>
        )}
        {kind === "eraser" && (
          <>
            <path d="m65 201-8 37m79-37 8 37" />
            <ellipse cx="49" cy="244" rx="19" ry="10" fill={ink} />
            <ellipse cx="151" cy="244" rx="19" ry="10" fill={ink} />
            <g className="character-arm arm-left">
              <path d="M35 143q-22 7-21-21m-1 3-5-8m8 5 6-7" />
            </g>
            <path d="M166 143q24 5 20 25" />
            <rect
              x="31"
              y="88"
              width="138"
              height="118"
              rx="27"
              fill="#EFA5B1"
            />
            <path
              d="M31 158h138v26q0 22-22 22H53q-22 0-22-22Z"
              fill="#F8DBDB"
            />
            <path d="M42 158h116" stroke="#D77F91" strokeWidth="2" />
            <Face y={126} mood={mood} />
          </>
        )}
        {kind === "book" && (
          <>
            <path d="m71 215-10 28m62-28 11 28" />
            <ellipse cx="56" cy="249" rx="18" ry="10" fill={ink} />
            <ellipse cx="141" cy="249" rx="18" ry="10" fill={ink} />
            <path d="M42 151q-23 4-25 26" />
            <g className="character-arm arm-right">
              <path d="M160 151q22-2 21-34m-1 5-7-8m10 7 6-9" />
            </g>
            <rect
              x="38"
              y="57"
              width="124"
              height="161"
              rx="14"
              fill="#FFF1CF"
            />
            <path d="M38 70q0-13 13-13h11v161H51q-13 0-13-13Z" fill="#6DA798" />
            <path d="M121 57v35l12-8 12 8V57" fill="#E39574" />
            <path d="M76 192h62m-62 9h49" stroke="#B4A68A" strokeWidth="2" />
            <Face x={111} y={128} mood={mood} />
          </>
        )}
        {kind === "correction" && (
          <>
            <g className="character-arm arm-left">
              <path d="M52 157q-25 3-26-20m0 0-7-6m11 5 5-9" />
            </g>
            <path d="M145 159q25-2 27 19" />
            <path d="m78 209-5 32m48-32 8 32" />
            <ellipse cx="67" cy="248" rx="18" ry="10" fill={ink} />
            <ellipse cx="134" cy="248" rx="18" ry="10" fill={ink} />
            <path
              d="M76 95h48v10l20 16q12 10 12 28v51q0 23-23 23H67q-23 0-23-23v-51q0-18 12-28l20-16Z"
              fill="#CF2928"
            />
            <path
              d="M54 137v52q0 24 24 24h44q24 0 24-24v-52"
              stroke="#AF2324"
              strokeWidth="5"
            />
            <path
              d="M78 14q22-6 44 0v81H78Z"
              fill="#ECEDEC"
            />
            <path
              d="M115 12q4 0 7 2v81H78v-9h24q13 0 13-15Z"
              fill="#D1D4D3"
              stroke="none"
            />
            <path d="M76 96h48" stroke="#A92525" strokeWidth="5" />
            <Face y={156} mood={mood} />
          </>
        )}
      </g>
    </svg>
  );
}
export function CharacterGroup({ footer = false }) {
  return (
    <div
      className={`character-group ${footer ? "is-footer" : ""}`}
      role="group"
      aria-label="Lima sahabat belajar: buku, pensil, pulpen, penghapus, dan tipe-x"
    >
      <span className="character-note">
        {footer ? "Sampai bertemu di kelas!" : "Yuk, cari tahu bersama!"}
      </span>
      <div className="group-character group-book">
        <Mascot kind="book" />
      </div>
      <div className="group-character group-pencil">
        <Mascot kind="pencil" mood="happy" />
      </div>
      <div className="group-character group-pen">
        <Mascot kind="pen" mood="think" />
      </div>
      <div className="group-character group-eraser">
        <Mascot kind="eraser" mood="happy" />
      </div>
      <div className="group-character group-correction">
        <Mascot kind="correction" mood="calm" />
      </div>
      <svg className="character-ground" viewBox="0 0 600 60" aria-hidden="true">
        <path
          d="M30 25q260 44 540 0"
          fill="none"
          stroke="#E4D6BE"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
