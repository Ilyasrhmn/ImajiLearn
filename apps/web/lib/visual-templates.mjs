import { geometryCatalog } from "./geometry-catalog.mjs";

export const earthLayers = [
  { id: "crust", label: "Kerak Bumi", radius: 172, inner: 155, offset: 0, fill: "#89a782", side: "#587559" },
  { id: "mantle", label: "Mantel", radius: 155, inner: 97, offset: 190, fill: "#d99168", side: "#a75b43" },
  { id: "outer_core", label: "Inti luar", radius: 97, inner: 50, offset: 338, fill: "#f3b65e", side: "#c9863f" },
  { id: "inner_core", label: "Inti dalam", radius: 50, inner: 0, offset: 434, fill: "#f9df8f", side: "#cea952" },
];

export function orbitalModel(step) {
  const content = [step.label, step.detail, step.evidence].filter(Boolean).join(" ");
  const earth = /geosentri[ks]|geocentri[cs]|bumi\s+(?:sebagai|adalah|merupakan)\s+pusat/iu.test(content);
  const sun = /heliosentri[ks]|heliocentri[cs]|matahari\s+(?:sebagai|adalah|merupakan)\s+pusat|planet(?:-planet)?\s+mengelilingi\s+matahari/iu.test(content);
  return sun ? "sun" : earth ? "earth" : null;
}

export function resolveVisualModel(visual) {
  if (typeof visual?.title !== "string" || !visual.title.trim()) return null;
  if (visual.kind !== "flow") return isSupportedModel(visual) ? visual : null;
  if (!validItems(visual.steps, step => validText(step.label) && validText(step.detail), 2)) return null;
  const evidence = visual.steps.map(step => step.evidence ?? "").join(" ");
  if (/pembekuan darah|darah membeku|\bhemostasis\b/iu.test(visual.title) &&
    /trombosit|fibrin(?:ogen)?|trombin|pembekuan darah/iu.test(evidence)) {
    return { kind: "blood_clot", title: "Pembekuan darah", steps: visual.steps };
  }
  const centers = visual.steps.map(orbitalModel);
  let center = centers.find(Boolean);
  if (!center) return null;
  const orbitSteps = visual.steps.map((step, index) => {
    center = centers[index] ?? center;
    return { ...step, center };
  });
  return { ...visual, kind: "solar_system", orbitSteps };
}

const plantFocus = ["light", "water", "carbon", "leaf", "oxygen", "sugar"];
const shapes = ["slab", "cylinder", "ring", "wedge"];
const tones = ["clay", "sage", "ochre", "blue", "ink"];
const validText = value => typeof value === "string" && Boolean(value.trim());
const validItems = (items, check, min = 1) => Array.isArray(items) && items.length >= min &&
  items.every(item => item && check(item));
const validVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function isSupportedModel(visual) {
  switch (visual.kind) {
    case "geometry": return Array.isArray(visual.shapes) && visual.shapes.length <= 8 &&
      validItems(visual.shapes, item => Object.hasOwn(geometryCatalog, item.shape) && validText(item.detail) &&
        validText(item.evidence) && geometryCatalog[item.shape].pattern.test(item.evidence)) &&
      new Set(visual.shapes.map(item => item.shape)).size === visual.shapes.length;
    case "blood_clot": return true;
    case "solar_system": return validItems(visual.orbitSteps, step =>
      ["earth", "sun"].includes(step.center) && validText(step.label) && validText(step.detail));
    case "photosynthesis": return validItems(visual.steps, step =>
      plantFocus.includes(step.focus) && validText(step.label) && validText(step.detail), 2);
    case "earth": return earthLayers.every(({ id }) => visual.details?.[id] === null || validText(visual.details?.[id])) &&
      earthLayers.some(({ id }) => validText(visual.details?.[id]));
    case "cube_net": return validText(visual.detail);
    case "assembly": return validItems(visual.parts, part => validText(part.id) && validText(part.label) && validText(part.detail) &&
      shapes.includes(part.shape) && tones.includes(part.tone) &&
      [part.at, part.size, part.spread].every(validVector), 2);
    default: return false;
  }
}

export const clotStages = [
  { label: "Dinding pembuluh", detail: "Saat dinding pembuluh terluka, bagian yang rusak menjadi tempat trombosit menempel." },
  { label: "Trombosit", detail: "Trombosit menempel dan berkumpul untuk membentuk sumbat sementara." },
  { label: "Jaring fibrin", detail: "Trombin mengubah fibrinogen menjadi fibrin. Serat fibrin menguatkan sumbat trombosit." },
];

export function clotParticles(stage) {
  return Array.from({ length: stage === 0 ? 7 : 18 }, (_, index) => {
    const angle = index * 2.4;
    const radius = .1 + Math.sqrt(index) * .21;
    return stage === 0 ? [-2.1 + index * .62, .24 + index % 3 * .12, Math.sin(angle) * .55]
      : [Math.cos(angle) * radius, .13 + index % 4 * .09, Math.sin(angle) * radius * .61];
  });
}

export function orbitBodies(center) {
  return center === "earth"
    ? [
      { label: "Bumi", color: "#4c82ad", size: .42, radius: 0, angle: 0 },
      { label: "Bulan", color: "#9fa6a0", size: .13, radius: 1.16, angle: 2.55 },
      { label: "Matahari", color: "#f4b941", size: .28, radius: 2.22, angle: .53 },
    ]
    : [
      { label: "Matahari", color: "#f4b941", size: .46, radius: 0, angle: 0 },
      { label: "Merkurius", color: "#a59482", size: .09, radius: .87, angle: 2.8 },
      { label: "Venus", color: "#dca05c", size: .15, radius: 1.28, angle: -1.9 },
      { label: "Bumi", color: "#4c82ad", size: .17, radius: 1.76, angle: .72 },
      { label: "Mars", color: "#b76549", size: .12, radius: 2.22, angle: -.42 },
    ];
}
