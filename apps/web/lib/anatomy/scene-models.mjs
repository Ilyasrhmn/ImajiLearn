import * as T from "three";
import { clotParticles, clotStages, earthLayers, orbitBodies } from "../visual-templates.mjs";

const v = (x, y, z) => new T.Vector3(x, y, z);
const mat = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness:.75, ...extra});
function mesh(parent, geo, material, x=0, y=0, z=0) {
  const item = new T.Mesh(geo, material);
  item.position.set(x,y,z);
  parent.add(item);
  return item;
}
function tube(parent, points, radius, material) {
  return mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, radius, 7, false), material);
}
function orb(parent, material, x,y,z,sx,sy,sz) {
  const item=mesh(parent,new T.SphereGeometry(1,16,12),material,x,y,z);
  item.scale.set(sx,sy,sz);
  return item;
}
function base(parent, y, sizeX, sizeZ) {
  const shadow=mesh(parent,new T.CircleGeometry(1,48),new T.MeshBasicMaterial({color:0x859475,transparent:true,opacity:.18}),0,y,0);
  shadow.rotation.x=-Math.PI/2;
  shadow.scale.set(sizeX,sizeZ,1);
}
function blade(parent, anchor, heading, rise, size, color) {
  const group=new T.Group();
  group.position.copy(anchor);
  group.rotation.y=heading;
  group.rotation.z=rise;
  group.scale.setScalar(size);
  parent.add(group);
  const positions=[], indices=[];
  const point=(t,s)=>v(t*1.2, .13*Math.sin(Math.PI*t)*(1-s*s)-.045*s*s, Math.sin(Math.PI*t)**.82*.35*s);
  for(let i=0;i<=16;i++) for(let j=0;j<=6;j++) {
    const p=point(i/16,j/3-1);
    positions.push(p.x,p.y,p.z);
    if(i<16 && j<6) {
      const k=i*7+j; indices.push(k,k+7,k+1,k+1,k+7,k+8);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute("position",new T.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(group,geometry,mat(color,{side:T.DoubleSide}));
  const vein=mat(0xb7c984);
  tube(group,[0,.2,.45,.7,.96].map(t=>point(t,0).add(v(0,.008,0))),.009,vein);
  for(const t of [.2,.36,.52,.67]) for(const side of [-1,1])
    tube(group,[point(t,0),point(t+.08,side*.42),point(t+.18,side*.85)].map(p=>p.add(v(0,.01,0))),.005,vein);
  return group;
}

export function plantScenes(step) {
  const plant=new T.Group();
  const stem=mat(0x527544);
  const branches=mat(0x809850);
  const root=mat(0xba9364);
  base(plant,-.47,2.1,1.28);
  mesh(plant,new T.BoxGeometry(3.6,.29,2.25),mat(0x80684b),0,-.25,0);
  mesh(plant,new T.BoxGeometry(3.64,.06,2.28),mat(0x98774e),0,-.079,0);
  tube(plant,[v(0,0,0),v(.08,.74,0),v(-.03,1.6,.03),v(.08,2.38,-.02),v(.03,3.03,0)],.067,stem).userData.pin = 1;
  for(let i=0;i<10;i++){
    const a=i*Math.PI*.21;
    tube(plant,[v(0,.025,0),v(Math.cos(a)*.42,-.01,Math.sin(a)*.34),v(Math.cos(a)*(1.07+(i%3)*.19),-.04,Math.sin(a)*.74)],.029-(i%3)*.005,root).userData.pin = 2;
  }
  for(let i=0;i<35;i++){
    const x=((i*61)%347)/100-1.73,z=((i*43)%208)/100-1.04;
    orb(plant,mat(i%2?0x977856:0xb49a75),x,-.047,z,.028,.01,.025);
  }
  let leafAnchor;
  for(const [i,y,angle,rise,size,color] of [
    [0,.97,1.6,.2,.86,0x65904f],[1,1.26,-2.72,.42,1.02,0x5d8b4e],
    [2,1.58,-.16,.36,1.15,0x749f55],[3,1.98,2.56,.28,1.05,0x4f8147],
    [4,2.31,-1.27,.38,.92,0x638f48],[5,2.67,1.1,.43,.82,0x82a85a],
    [6,2.89,-.85,.72,.64,0x769e4f],
  ]){
    const end=v(Math.cos(angle)*.34,y+.07,-Math.sin(angle)*.34);
    tube(plant,[v(.01,y,0),end],.024,branches);
    const leaf=blade(plant,end,angle,rise,size,color);
    leaf.userData.pin = 0;
    if(i===2) leafAnchor=leaf;
  }

  const section=new T.Group();
  base(section,-.12,1.98,1.21);
  const sectionParts=[];
  const slabPath=new T.Shape();
  slabPath.moveTo(-1.4,-.57);slabPath.lineTo(1.34,-.57);
  slabPath.bezierCurveTo(1.6,-.4,1.7,.25,1.23,.56);
  slabPath.bezierCurveTo(.67,1.02,-.53,1.03,-1.2,.52);
  slabPath.bezierCurveTo(-1.6,.22,-1.65,-.31,-1.4,-.57);
  const skinGeo=new T.ExtrudeGeometry(slabPath,{depth:.11,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:2,curveSegments:16});
  skinGeo.rotateX(-Math.PI/2);
  for(const [i,height,color] of [[0,.07,0x83a876],[1,.23,0xb6c983],[2,.53,0x87a65f],[3,.81,0x618947]]){
    const group=new T.Group();
    group.position.y=height;
    section.add(group);
    group.userData.pin = [3, 2, 1, 0][i];
    sectionParts.push({group,height});
    mesh(group,skinGeo,mat(color));
    if(i===1 || i===2) for(let n=0;n<26;n++){
      const row=Math.floor(n/9),x=-1.24+(n%9)*.3,z=.49-row*.37;
      orb(group,mat(i===2?0x7b9d57:0xbacc86),x,.17,z,.145,i===2?.19:.105,.14);
      if(i===2) for(let q=0;q<3;q++) orb(group,mat(0x426e3d),x-.05+q*.046,.207+q*.04,z+.105,.026,.038,.021).userData.pin = 4;
    }
  }

  const chloro=new T.Group();
  base(chloro,-.28,1.97,1.27);
  const shell=mesh(chloro,new T.CylinderGeometry(1.37,1.28,.24,64),mat(0x628753),0,0,0);
  shell.scale.z=.72;
  shell.userData.pin = 2;
  const inside=mesh(chloro,new T.CylinderGeometry(1.29,1.29,.025,64),mat(0xd4de9a),0,.127,0);
  inside.scale.z=.67;
  inside.userData.pin = 1;
  const rim=mesh(chloro,new T.TorusGeometry(1.32,.035,9,70),mat(0x93ad61),0,.147,0);
  rim.rotation.x=-Math.PI/2;rim.scale.y=.69;rim.userData.pin = 2;
  const clusters=[[-.88,.12,4],[-.54,-.38,5],[-.36,.49,4],[.05,-.06,6],[.48,-.37,4],[.49,.43,4],[.89,.07,5]];
  for(const [x,z,n] of clusters){
    for(let i=0;i<n;i++) mesh(chloro,new T.CylinderGeometry(.145,.145,.041,28),mat(i===n-1?0x8eb475:0x56854c),x,.157+i*.055,z).userData.pin = 0;
  }
  for(const chain of [[0,1,3,4,6],[2,5,6]]) tube(chloro,chain.map(i=>v(clusters[i][0],.158,clusters[i][1])),.035,mat(0x90ae60));

  const leafPoint = leafAnchor.localToWorld(v(.78,.15,0));
  const paths = {
    light: { start: v(2.15,2.85,.4), end: leafPoint, color: 0xad6b18, label: "Cahaya" },
    water: { start: v(-.65,.06,.52), via: v(.02,1.16,.14), end: leafPoint, color: 0x176c9a, label: "Air" },
    carbon: { start: v(2.2,1.7,.45), end: leafPoint, color: 0x5b4f92, label: "CO₂" },
    oxygen: { start: leafPoint, end: v(2.25,2.65,.5), color: 0x286782, label: "O₂" },
    sugar: { start: leafPoint, via: v(.02,1.16,.14), end: v(.55,.06,.55), color: 0x9b522f, label: "Gula" },
  };
  const signal = paths[step.focus];
  if (signal) {
    const points = [signal.start, ...(signal.via ? [signal.via] : []), signal.end];
    const route = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineDashedMaterial({
      color: signal.color, dashSize: .08, gapSize: .05, depthTest: false,
    }));
    route.computeLineDistances();
    route.renderOrder = 2;
    plant.add(route);
    const tip = signal.end.clone().sub(points.at(-2)).normalize();
    const marker = mesh(plant, new T.ConeGeometry(.075,.16,16), new T.MeshBasicMaterial({ color: signal.color, depthTest: false }));
    marker.position.copy(signal.end).addScaledVector(tip,-.07);
    marker.quaternion.setFromUnitVectors(v(0,1,0), tip);
    marker.renderOrder = 2;
  }
  const views=[
   {name:"Tanaman",group:plant,target:v(0,1.38,0),distance:6.4,angle:.44,pitch:.19,detail:step.detail, caption:step.label,
    pins:[
     {label:"Daun",at:()=>leafAnchor.localToWorld(v(.78,.15,0)),go:1,side:"right", lift:-21},
     {label:"Batang",at:()=>v(0,1.16,.16),info:"Batang menyalurkan air dari akar menuju daun.",side:"left", lift:-14},
     {label:"Akar",at:()=>v(-.58,.02,.52),info:"Akar menyerap air dari tanah.",side:"left", lift:18}
    ]},
   {name:"Penampang daun",group:section, slider:"Pisahkan lapisan",target:v(0,.61,0),distance:5.7,angle:.48,pitch:.32,detail:"Jaringan daun tersusun berlapis. Buka lapisan untuk melihat sel di bagian dalam.",
    pins:[
     {label:"Epidermis atas",at:()=>v(.58,sectionParts[3].group.position.y+.12,.44),info:"Lapisan pelindung di permukaan atas daun.",side:"right", lift:-35},
     {label:"Palisade",at:()=>v(-1.1,sectionParts[2].group.position.y+.2,.55),info:"Sel rapat yang mengandung banyak kloroplas.",side:"left", lift:-15},
     {label:"Jaringan spons",at:()=>v(.86,sectionParts[1].group.position.y+.19,.60),info:"Ruang di antara sel membantu pertukaran gas di dalam daun.",side:"right", lift:18},
     {label:"Epidermis bawah",at:()=>v(-1.04,sectionParts[0].group.position.y+.06,.58),info:"Lapisan pelindung di sisi bawah daun, tempat stomata sering ditemukan.",side:"left", lift:25},
     {label:"Kloroplas",at:()=>v(.602,sectionParts[2].group.position.y+.29,.595),go:2,side:"right", lift:-8}
    ]},
   {name:"Kloroplas",group:chloro,target:v(0,.08,0),distance:4.6,angle:.45,pitch:.51,detail:"Di dalam kloroplas, tilakoid menangkap cahaya dan stroma menjadi tempat pembentukan bahan penyusun gula.",
    pins:[
     {label:"Tilakoid",at:()=>v(.05,.46,-.06),info:"Cakram kecil yang tersusun seperti tumpukan. Reaksi terang terjadi di membran tilakoid.",side:"right", lift:-48},
     {label:"Stroma",at:()=>v(-.66,.14,.39),info:"Cairan di sekitar tumpukan tilakoid. Siklus Calvin berlangsung di sini.",side:"left", lift:30},
     {label:"Membran",at:()=>v(.94,.13,.61),info:"Selubung yang membungkus kloroplas.",side:"right", lift:30}
    ]}
  ];
  if (signal) views[0].pins.push({
    label: signal.label, at: () => step.focus === "oxygen" ? signal.end : signal.start,
    info: step.detail, side: step.focus === "water" ? "left" : "right", lift: -24,
  });
  if (/^(carbon|oxygen)$/.test(step.focus) && /stomat/i.test([step.label, step.detail, step.evidence].join(" "))) {
    const stoma = new T.Group();
    base(stoma, -.27, 1.65, 1.06);
    orb(stoma, mat(0xaac47c), 0,-.05,0,1.42,.16,1.02);
    orb(stoma, mat(0x2b583b), 0,.11,0,.24,.05,.6).userData.pin = 0;
    const cells = mat(0x739c58);
    for (const side of [-1, 1]) {
      tube(stoma, [v(0,.17,-.62),v(side*.26,.23,-.37),v(side*.34,.24,0),v(side*.26,.23,.37),v(0,.17,.62)], .14, cells).userData.pin = 1;
    }
    const [x, z] = [-1.04, .58];
    views[1].pins[3] = {
      label: "Stomata", at: () => v(x, sectionParts[0].group.position.y + .06, z), go: 3, side: "left", lift: 25,
    };
    views.push({ name: "Stomata", parent: 1, group: stoma, target: v(0,.04,0), distance: 4.4, angle: .42, pitch: .85,
      caption: step.label, detail: step.detail,
      pins: [
        { label: "Pori stomata", at: () => v(0,.17,0), info: "Bukaan pada permukaan daun yang dilalui gas.", side: "left", lift: -22 },
        { label: "Sel penjaga", at: () => v(.34,.36,0), info: "Sel di kedua sisi pori mengatur bukaan stomata.", side: "right", lift: 26 },
      ],
    });
  }
  views[1].setSpread = spread => {
    sectionParts.forEach(({group, height}, index) => {
      group.position.y = height + (index - 1.5) * spread * .32;
    });
  };
  return views;
}

const continents = [
  [-108, 48, 41, 25], [-82, 19, 16, 10], [-60, -15, 19, 32],
  [-42, 72, 16, 11], [15, 52, 24, 17], [20, 7, 25, 31],
  [79, 48, 58, 26], [110, 16, 27, 14], [135, -25, 19, 13],
];

function globe(radius, hemisphere = false) {
  const geometry = new T.SphereGeometry(radius, 80, 48, hemisphere ? -Math.PI / 2 : 0, hemisphere ? Math.PI : Math.PI * 2);
  const points = geometry.getAttribute("position");
  const colors = [];
  for (let i = 0; i < points.count; i++) {
    const latitude = Math.asin(T.MathUtils.clamp(points.getY(i) / radius, -1, 1)) * 180 / Math.PI;
    const longitude = Math.atan2(points.getX(i), points.getZ(i)) * 180 / Math.PI;
    const land = continents.some(([lng, lat, width, height]) =>
      ((longitude - lng) / width) ** 2 + ((latitude - lat) / height) ** 2 < 1);
    const color = new T.Color(Math.abs(latitude) > 72 ? 0xd9e5dd : land ? 0x78a275 : 0x5991a9);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  return new T.Mesh(geometry, mat(0xffffff, { vertexColors: true }));
}

export function earthScenes(details) {
  const earth = new T.Group();
  base(earth, -1.6, 1.7, 1.3);
  const surface = globe(1.48);
  surface.userData.pin = 0;
  earth.add(surface);
  const section = new T.Group();
  base(section, -1.6, 2.7, 1.25);
  const layers = earthLayers.map((layer, index) => {
    const group = new T.Group();
    const radius = layer.radius / 116;
    const inner = layer.inner / 116;
    const angle = [-.48, .42, -.86, .72][index];
    const anchorRadius = (radius + inner) / 2;
    group.position.x = -.75;
    if (index === 0) group.add(globe(radius, true));
    else mesh(group, new T.SphereGeometry(radius, 36, 22, -Math.PI / 2, Math.PI), mat(layer.side));
    if (inner > 0) {
      mesh(group, new T.SphereGeometry(inner, 40, 24, -Math.PI / 2, Math.PI),
        mat(layer.side, { side: T.BackSide }));
    }
    const cut = mesh(group, new T.RingGeometry(inner, radius, 64), mat(layer.fill, { side: T.DoubleSide }), index * .008);
    cut.rotation.y = Math.PI / 2;
    group.userData.pin = index;
    section.add(group);
    return {
      group,
      pin: { label: layer.label, at: () => group.localToWorld(v(.025, Math.sin(angle) * anchorRadius, Math.cos(angle) * anchorRadius)),
        info: details[layer.id] ?? "Bagian ini belum dijelaskan di materi.", side: index < 2 ? "left" : "right", lift: [-18, -60, 42, -52][index] },
    };
  });
  return [
    { name: "Bumi", group: earth, target: v(0, 0, 0), distance: 5.8, angle: .3, pitch: .24,
      detail: "Pilih penampang untuk melihat bagian dalam Bumi.",
      pins: [{ label: "Penampang Bumi", at: () => v(1, .43, 1), go: 1, side: "right", lift: -30 }] },
    { name: "Penampang Bumi", group: section, target: v(0, 0, 0), distance: 7.3, angle: 1.02, pitch: .22, mobileFit: 1.48,
      detail: "Pilih lapisan untuk membaca keterangannya. Model tidak sesuai skala.",
      pins: layers.map(layer => layer.pin), slider: "Pisahkan lapisan",
      setSpread(spread) {
        layers.forEach(({ group }, index) => { group.position.x = -.75 + [0, 1.3, 2.55, 3.5][index] * spread; });
      } },
  ];
}

const tones = { clay: 0xc57e63, sage: 0x81a66c, ochre: 0xd7ae66, blue: 0x77a5b5, ink: 0x647d86 };

export function cubeScenes(detail) {
  const group = new T.Group();
  const panel = (parent, color, x, z) => {
    const face = mesh(parent, new T.PlaneGeometry(.98, .98), mat(color, { side: T.DoubleSide }), x, 0, z);
    face.rotation.x = -Math.PI / 2;
    return face;
  };
  const pivot = (parent, x, z) => {
    const hinge = new T.Group();
    hinge.position.set(x, 0, z);
    parent.add(hinge);
    return hinge;
  };
  const front = pivot(group, 0, .5), back = pivot(group, 0, -.5);
  const left = pivot(group, -.5, 0), right = pivot(group, .5, 0);
  const lid = pivot(back, 0, -1);
  const panels = [
    panel(group, 0xaec6a2, 0, 0), panel(back, 0xe2a183, 0, -.5),
    panel(lid, 0xeed395, 0, -.5), panel(front, 0x8fb4bc, 0, .5),
    panel(left, 0xc6add3, -.5, 0), panel(right, 0xe6aeaa, .5, 0),
  ];
  const pins = panels.map((face, index) => {
    face.userData.pin = index;
    return { label: `Sisi ${index + 1}`, info: detail,
      at: () => face.getWorldPosition(v(0, 0, 0)), side: index % 2 ? "left" : "right" };
  });
  return [{ name: "Jaring-jaring kubus", group, target: v(0, 0, -.5), distance: 6.4, angle: .3, pitch: .84,
    detail, pins, slider: "Lipat jaring-jaring",
    setSpread(value) {
      const angle = value * Math.PI / 2;
      front.rotation.x = -angle;
      back.rotation.x = lid.rotation.x = angle;
      left.rotation.z = -angle;
      right.rotation.z = angle;
    },
  }];
}

export function clotScenes() {
  return clotStages.map((stage, index) => {
    const group = new T.Group();
    const wall = mat(0xbb6865, { side: T.DoubleSide });
    const vessel = mesh(group, new T.CylinderGeometry(.98, .98, 5.1, 64, 1, true, Math.PI * .5, Math.PI * 1.43), wall);
    vessel.rotation.z = Math.PI / 2;
    vessel.rotation.y = .4;
    vessel.userData.pin = 0;
    const injury = mesh(group, new T.SphereGeometry(1, 24, 12), mat(0x743d46), 0, -.78, .2);
    injury.scale.set(.94, .16, .45);
    injury.userData.pin = 0;
    const platelets = mat(0xe9b65a);
    clotParticles(index).forEach(([x, y, z], i) => {
      const particle = orb(group, platelets, x, y - .69, z + .18, .14, .058, .11);
      particle.rotation.set(i * .43, i * .73, i * .62);
      particle.userData.pin = 1;
    });
    const fibers = mat(0xffdfb7);
    if (index === 2) for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const x = Math.cos(angle) * .92, z = Math.sin(angle) * .57;
      tube(group, [v(x, -.59, .18 + z), v(-z * .6, -.24, .18 + x * .3), v(-x * .72, -.57, .18 - z * .8)], .021, fibers).userData.pin = 2;
    }
    const pins = clotStages.slice(0, Math.min(3, index + 2)).map((item, part) => ({
      ...item, info: item.detail,
      at: () => [v(.76, -.66, .48), v(-.26, -.34, .32), v(.46, -.28, .48)][part],
      side: part === 1 ? "left" : "right", lift: [30, -25, -54][part],
      ...(part === index + 1 ? { go: part } : {}),
    }));
    return { name: stage.label, group, target: v(0, -.18, 0), distance: 7.6, angle: .26, pitch: .73,
      detail: stage.detail, pins };
  });
}

export function solarScenes(visual) {
  return visual.orbitSteps.map((step, index) => {
    const group = new T.Group();
    const historical = step.center === "earth";
    const pins = orbitBodies(step.center).map(({ label, color, size, radius, angle }, pin) => {
      if (radius) {
        const ring = mesh(group, new T.RingGeometry(radius - .012, radius + .012, 96),
          new T.MeshBasicMaterial({ color: 0x859784, side: T.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
      }
      const body = orb(group, mat(color, label === "Matahari" ? { emissive: color, emissiveIntensity: .32 } : {}),
        radius * Math.cos(angle), size * .24, radius * Math.sin(angle), size, size, size);
      body.userData.pin = pin;
      return {
        label,
        at: () => body.position.clone().add(v(0, size * .6, 0)),
        info: radius ? (historical ? `${label} digambarkan mengelilingi Bumi dalam model historis ini.` : `${label} mengorbit Matahari.`) : step.detail,
        side: pin % 2 ? "left" : "right",
        lift: pin * 12 - 25,
      };
    });
    const next = visual.orbitSteps[index + 1];
    if (next) {
      pins.push({
        label: next.label, at: () => v(1.55, 0, 1.55),
        go: index + 1, side: "right", lift: 46,
      });
    }
    return {
      name: historical ? "Geosentris" : "Heliosentris", parent: index === 0 ? -1 : 0,
      group, target: v(0, 0, 0), distance: 8, angle: .2, pitch: .85,
      caption: step.label, detail: step.detail, pins,
    };
  });
}

function partGeometry(shape, width, depth, height) {
  if (shape === "slab") return new T.BoxGeometry(width, height, depth).translate(0, height / 2, 0);
  if (shape === "cylinder") return new T.CylinderGeometry(width / 2, width / 2, height, 40).translate(0, height / 2, 0);
  const outline = new T.Shape();
  if (shape === "ring") {
    outline.absarc(0, 0, width / 2, 0, Math.PI * 2);
    const hole = new T.Path();
    hole.absarc(0, 0, width * .26, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    return new T.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, curveSegments: 32 }).rotateX(-Math.PI / 2);
  }
  outline.moveTo(-width / 2, 0);
  outline.lineTo(width / 2, 0);
  outline.lineTo(0, height);
  outline.closePath();
  return new T.ExtrudeGeometry(outline, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

export function assemblyScenes(visual) {
  const group = new T.Group();
  const scale = .016;
  const bounds = new T.Box3();
  const models = visual.parts.map((part, index) => {
    const [width, depth, height] = part.size.map(value => value * scale);
    const [x, z, y] = part.at.map(value => value * scale);
    const [dx, dz, dy] = part.spread.map(value => value * scale);
    const origin = v(x, y, z);
    const motion = v(dx, dy, dz);
    const item = mesh(group, partGeometry(part.shape, width, depth, height), mat(tones[part.tone]), x, y, z);
    item.userData.pin = index;
    item.geometry.computeBoundingBox();
    const volume = item.geometry.boundingBox.clone().translate(origin);
    bounds.union(volume).union(volume.clone().translate(motion));
    const point = part.shape === "ring" ? v(width * .37, height, 0) : v(0, height, 0);
    return { item, origin, motion, pin: {
      label: part.label, info: part.detail, at: () => item.localToWorld(point.clone()),
      side: index % 2 ? "right" : "left", lift: 0,
    } };
  });
  const center = bounds.getCenter(v(0, 0, 0));
  const diameter = bounds.getSize(v(0, 0, 0)).length();
  return [{
    name: "Model", group, target: center, distance: Math.max(2.8, diameter * 1.65), angle: .48, pitch: .32,
    caption: visual.parts[0].label, detail: visual.parts[0].detail, pins: models.map(model => model.pin),
    slider: "Pisahkan bagian",
    setSpread(spread) {
      for (const { item, origin, motion } of models) item.position.copy(origin).addScaledVector(motion, spread);
    },
  }];
}
