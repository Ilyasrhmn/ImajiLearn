// Parts describe selectable teaching targets, not interchangeable geometric shapes.
export const learningModels = {
  food_chain: {
    label: "Rantai makanan", topic: /rantai makanan|produsen.*konsumen/iu,
    parts: {
      grass: { label: "Rumput", pattern: /rumput/iu },
      rabbit: { label: "Kelinci", pattern: /kelinci/iu },
      snake: { label: "Ular", pattern: /\bular\b/iu },
      eagle: { label: "Elang", pattern: /elang/iu },
    },
  },
  indonesia: {
    label: "Peta Indonesia", topic: /indonesia|nusantara/iu,
    parts: {
      sumatra: { label: "Sumatra", pattern: /sumat[er]+a/iu },
      java: { label: "Jawa", pattern: /\bjawa\b/iu },
      kalimantan: { label: "Kalimantan", pattern: /kalimantan/iu },
      sulawesi: { label: "Sulawesi", pattern: /sulawesi/iu },
      papua: { label: "Papua", pattern: /papua/iu },
    },
  },
  respiratory: {
    label: "Sistem pernapasan", topic: /pernapasan|paru[ -]paru|alveol/iu,
    parts: {
      trachea: { label: "Trakea", pattern: /trakea|trachea|tenggorokan/iu },
      bronchi: { label: "Bronkus", pattern: /bronkus|bronchus|bronki/iu },
      lungs: { label: "Paru-paru", pattern: /paru[ -]paru/iu },
      alveoli: { label: "Alveolus", pattern: /alveol/iu },
      diaphragm: { label: "Diafragma", pattern: /diafragma/iu },
    },
  },
  deliberation: {
    label: "Musyawarah kelas", topic: /musyawarah|mufakat/iu,
    parts: {
      opinion: { label: "Pendapat", pattern: /pendapat|usul/iu },
      listen: { label: "Mendengarkan", pattern: /mendengar|menghargai|menghormati/iu },
      agreement: { label: "Kesepakatan", pattern: /mufakat|kesepakatan|keputusan bersama/iu },
      responsibility: { label: "Tanggung jawab", pattern: /melaksanakan|tanggung jawab/iu },
    },
  },
  angklung: {
    label: "Angklung", topic: /angklung/iu,
    parts: {
      bamboo: { label: "Tabung bambu", pattern: /bambu|tabung/iu },
      frame: { label: "Rangka", pattern: /rangka|bingkai/iu },
      shake: { label: "Digoyangkan", pattern: /goyang|getar/iu },
      sound: { label: "Bunyi", pattern: /bunyi|nada|suara/iu },
    },
  },
  circuit: {
    label: "Rangkaian listrik sederhana", topic: /rangkaian listrik|rangkaian tertutup|rangkaian terbuka/iu,
    parts: {
      battery: { label: "Baterai", pattern: /baterai/iu },
      wire: { label: "Kabel", pattern: /kabel|penghantar/iu },
      switch: { label: "Sakelar", pattern: /sak[el]*ar|sakelar/iu },
      bulb: { label: "Lampu", pattern: /lampu|bohlam/iu },
    },
  },
};

const normalized = value => value.normalize("NFC").replace(/\s+/gu, " ").trim();

export function validLearningModel(visual, source) {
  const model = Object.hasOwn(learningModels, visual?.model ?? "") ? learningModels[visual.model] : null;
  if (!model || !Array.isArray(visual.parts) || visual.parts.length < 2 || visual.parts.length > 5) return false;
  if (source && !model.topic.test(`${source.title}\n${source.text}`)) return false;
  if (new Set(visual.parts.map(part => part?.id)).size !== visual.parts.length) return false;
  if (visual.model === "food_chain" && !validFoodChain(visual, source)) return false;
  return visual.parts.every(part => {
    const spec = Object.hasOwn(model.parts, part?.id ?? "") ? model.parts[part.id] : null;
    return spec && typeof part.detail === "string" && part.detail.trim().length > 0 && part.detail.length <= 300 &&
      !/https?:|www\.|berasal dari bahasa|etimologi/iu.test(part.detail) &&
      typeof part.evidence === "string" && part.evidence.length <= 600 && spec.pattern.test(part.evidence) &&
      (!source || normalized(source.text).includes(normalized(part.evidence)));
  });
}

function validFoodChain(visual, source) {
  if (!Array.isArray(visual.links) || visual.links.length !== visual.parts.length - 1) return false;
  const ids = new Set(visual.parts.map(part => part?.id));
  const outgoing = new Map(), incoming = new Set();
  for (const link of visual.links) {
    if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to || outgoing.has(link.from) || incoming.has(link.to) ||
      typeof link.evidence !== "string" || link.evidence.length > 600 || /\btidak\b/iu.test(link.evidence)) return false;
    const prey = learningModels.food_chain.parts[link.from]?.pattern.source;
    const predator = learningModels.food_chain.parts[link.to]?.pattern.source;
    if (!prey || !predator) return false;
    const relation = new RegExp(`(?:${prey}).{0,60}(?:dimakan|dimangsa|menjadi makanan).{0,60}(?:${predator})|(?:${predator}).{0,60}(?:memakan|memangsa).{0,60}(?:${prey})`, "iu");
    if (!relation.test(link.evidence) || (source && !normalized(source.text).includes(normalized(link.evidence)))) return false;
    outgoing.set(link.from, link.to); incoming.add(link.to);
  }
  const starts = [...ids].filter(id => !incoming.has(id));
  if (starts.length !== 1) return false;
  const visited = new Set(); let id = starts[0];
  while (id && !visited.has(id)) { visited.add(id); id = outgoing.get(id); }
  return !id && visited.size === ids.size;
}

export const learningModelInstructions = Object.entries(learningModels).map(([id, model]) =>
  `${id} (${model.label}): ${Object.entries(model.parts).map(([part, spec]) => `${part}=${spec.label}`).join(", ")}`
).join("; ");
