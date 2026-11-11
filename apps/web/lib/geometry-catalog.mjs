const polygon = (count, radius = 1.2, start = Math.PI / 2) => Array.from({ length: count }, (_, i) =>
  [radius * Math.cos(start + i * Math.PI * 2 / count), radius * Math.sin(start + i * Math.PI * 2 / count), 0]);

export const geometryCatalog = {
  square: { label: "Persegi", pattern: /\bpersegi(?!\s+panjang)\b/iu, vertices: [[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]] },
  rectangle: { label: "Persegi panjang", pattern: /\bpersegi\s+panjang\b/iu, vertices: [[-1.4,-.85,0],[1.4,-.85,0],[1.4,.85,0],[-1.4,.85,0]] },
  triangle: { label: "Segitiga", pattern: /\bsegitiga\b/iu, vertices: polygon(3) },
  circle: { label: "Lingkaran", pattern: /\blingkaran\b/iu, curved: true },
  parallelogram: { label: "Jajar genjang", pattern: /\bjajar\s*genjang\b/iu, vertices: [[-1.4,-.8,0],[.7,-.8,0],[1.4,.8,0],[-.7,.8,0]] },
  trapezoid: { label: "Trapesium", pattern: /\btrapesium\b/iu, vertices: [[-1.4,-.8,0],[1.4,-.8,0],[.8,.8,0],[-.8,.8,0]] },
  rhombus: { label: "Belah ketupat", pattern: /\bbelah\s+ketupat\b/iu, vertices: [[0,1.3,0],[.85,0,0],[0,-1.3,0],[-.85,0,0]] },
  kite: { label: "Layang-layang", pattern: /\blayang[\s-]+layang\b/iu, vertices: [[0,1.2,0],[.8,.35,0],[0,-1.3,0],[-.8,.35,0]] },
  cube: { label: "Kubus", pattern: /\bkubus\b/iu, solid: true,
    vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    faces: [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]] },
  cuboid: { label: "Balok", pattern: /\bbalok\b/iu, solid: true,
    vertices: [[-1.4,-.8,-.7],[1.4,-.8,-.7],[1.4,.8,-.7],[-1.4,.8,-.7],[-1.4,-.8,.7],[1.4,-.8,.7],[1.4,.8,.7],[-1.4,.8,.7]],
    faces: [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]] },
  triangular_prism: { label: "Prisma segitiga", pattern: /\bprisma\s+segitiga\b/iu, solid: true,
    vertices: [[-1,-.8,-.8],[1,-.8,-.8],[0,1,-.8],[-1,-.8,.8],[1,-.8,.8],[0,1,.8]],
    faces: [[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]] },
  square_pyramid: { label: "Limas segiempat", pattern: /\blimas\s+(?:segi\s*empat|persegi)\b/iu, solid: true,
    vertices: [[-1,-.8,-1],[1,-.8,-1],[1,-.8,1],[-1,-.8,1],[0,1.2,0]],
    faces: [[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]] },
  cylinder: { label: "Tabung", pattern: /\btabung\b/iu, solid: true, curved: true },
  cone: { label: "Kerucut", pattern: /\bkerucut\b/iu, solid: true, curved: true },
  sphere: { label: "Bola", pattern: /\bbola\b/iu, solid: true, curved: true },
};

export function geometryEdges(spec) {
  const faces = spec.faces ?? [spec.vertices?.map((_, i) => i) ?? []];
  const edges = new Map();
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    const pair = [face[i], face[(i + 1) % face.length]].sort((a,b) => a-b);
    edges.set(pair.join(","), pair);
  }
  return [...edges.values()];
}
