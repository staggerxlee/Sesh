// Original Sesh sculpture. Run from frontend with node art/build-salon-details.mjs.
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import {
  mergeVertices,
  mergeGeometries,
} from "three/addons/utils/BufferGeometryUtils.js";
import { writeFileSync } from "node:fs";

globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};
const vec = (x, y, z) => new T.Vector3(x, y, z);
const tau = 2 * Math.PI;
const material = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92,
  side: T.DoubleSide,
});
function part(parent, name, x = 0, y = 0, z = 0) {
  const g = new T.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function add(parent, geo, tint, position, scale, rotation) {
  const rgb = new T.Color(tint);
  if (!geo.attributes.color)
    geo.setAttribute(
      "color",
      new T.Float32BufferAttribute(
        Array.from({ length: geo.attributes.position.count }, () =>
          rgb.toArray(),
        ).flat(),
        3,
      ),
    );
  const m = new T.Mesh(geo, material);
  if (position) m.position.copy(position);
  if (scale) m.scale.copy(scale);
  if (rotation) m.rotation.set(...rotation);
  parent.add(m);
  return m;
}
function oval(parent, pos, radii, color, rotation) {
  return add(
    parent,
    new T.SphereGeometry(1, 16, 12),
    color,
    pos,
    radii,
    rotation,
  );
}
// A tapered volume around a curved spine; useful for a plume, muzzle and toes.
function sweep(parent, points, width, depth, tint, rings = 16, sides = 12) {
  const curve = new T.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(rings, false);
  const pos = [],
    idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings,
      p = curve.getPointAt(t);
    for (let j = 0; j < sides; j++) {
      const a = (tau * j) / sides;
      const point = p
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * width(t))
        .addScaledVector(frames.binormals[i], Math.sin(a) * depth(t));
      pos.push(...point.toArray());
      if (i < rings) {
        const k = i * sides + j,
          n = i * sides + ((j + 1) % sides);
        idx.push(k, n, k + sides, n, n + sides, k + sides);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return add(parent, geo, tint);
}
const thread = (parent, points, r, c) =>
  sweep(
    parent,
    points,
    () => r,
    () => r,
    c,
    14,
    7,
  );
function bake(group) {
  for (const child of [...group.children]) if (child.isGroup) bake(child);
  const pieces = group.children.filter((c) => c.isMesh);
  if (!pieces.length) return;
  const geometries = pieces.map((m) => {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    g.deleteAttribute("uv");
    return g;
  });
  const mesh = new T.Mesh(mergeGeometries(geometries), material);
  mesh.name = group.name + "Surface";
  group.remove(...pieces);
  group.add(mesh);
}
async function save(group, file) {
  bake(group);
  writeFileSync(
    new URL("../public/atelier/" + file, import.meta.url),
    Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true })),
  );
}

const dog = new T.Group();
dog.name = "SleepingSpitz";
const cushion = part(dog, "FlaxCushion");
// A flattened, dimpled oval with a welted edge and woven flecks.
const cushionGeo = new T.SphereGeometry(1, 72, 30);
const pos = cushionGeo.attributes.position,
  colors = [];
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i),
    y = pos.getY(i),
    z = pos.getZ(i);
  const angle = Math.atan2(z, x),
    fold =
      Math.sin(13 * angle + 0.7) * Math.sin(5 * angle) * 0.013 * (1 - y * y);
  pos.setXYZ(
    i,
    x * (0.64 + fold),
    0.105 + y * 0.095 - (y > 0 ? 0.04 * y ** 4 : 0),
    z * (0.43 + fold),
  );
  const weave =
    (Math.sin(x * 190) * Math.cos(z * 139) + Math.sin(z * 250)) * 0.028;
  colors.push(
    ...new T.Color("#a78a70").multiplyScalar(1 + weave + 0.065 * y).toArray(),
  );
}
cushionGeo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
cushionGeo.computeVertexNormals();
add(cushion, cushionGeo);
const welt = Array.from({ length: 65 }, (_, i) =>
  vec(
    0.636 * Math.cos((tau * i) / 64),
    0.108 + 0.003 * Math.sin(i * 0.6),
    0.428 * Math.sin((tau * i) / 64),
  ),
);
add(
  cushion,
  new T.TubeGeometry(new T.CatmullRomCurve3(welt), 80, 0.006, 6, true),
  "#bda086",
);
const coat = "#efede4",
  cream = "#e6e2d5",
  white = "#f8f6ec";
// Blend the shoulder, haunch and muzzle into continuous sculpted surfaces.
// Shallow flowing grooves catch light across the coat without detached fur tufts.
function sculpt(parent, lobes, center, bounds, blend, color, grain) {
  const n = 40,
    field = new MarchingCubes(n, material, false, false, 22000);
  field.isolation = 0;
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = center.x + ((2 * i) / n - 1) * bounds.x,
          y = center.y + ((2 * j) / n - 1) * bounds.y,
          z = center.z + ((2 * k) / n - 1) * bounds.z;
        let distance = Infinity;
        for (const [cx, cy, cz, rx, ry, rz] of lobes) {
          const d =
            (Math.hypot((x - cx) / rx, (y - cy) / ry, (z - cz) / rz) - 1) *
            Math.min(rx, ry, rz);
          const h = Math.max(0, blend - Math.abs(distance - d)) / blend;
          distance = Math.min(distance, d) - h * h * blend * 0.25;
        }
        const comb =
          55 * z +
          43 * y +
          8 * Math.sin(5 * x + 6 * z) +
          3 * Math.sin(15 * x - 5 * y);
        const grooves = Math.sin(comb) + 0.46 * Math.sin(1.67 * comb + 12 * x);
        field.field[i + n * (j + n * k)] = -distance + grain * grooves;
      }
  field.update();
  const geo = new T.BufferGeometry();
  for (const key of ["position", "normal"])
    geo.setAttribute(
      key,
      new T.Float32BufferAttribute(
        field.geometry.attributes[key].array.slice(0, field.count * 3),
        3,
      ),
    );
  geo
    .scale(bounds.x, bounds.y, bounds.z)
    .translate(center.x, center.y, center.z);
  add(parent, mergeVertices(geo), color);
  field.geometry.dispose();
}
const chest = part(dog, "Ribcage", -0.05, 0.29, -0.026);
sculpt(
  chest,
  [
    [-0.06, 0.025, -0.026, 0.33, 0.163, 0.208],
    [-0.202, -0.018, 0.074, 0.23, 0.151, 0.19],
    [0.151, 0.007, 0.055, 0.214, 0.171, 0.183],
    [0.224, 0.043, 0.075, 0.157, 0.154, 0.157],
  ],
  vec(-0.035, 0, 0),
  vec(0.48, 0.25, 0.33),
  0.08,
  coat,
  0.0034,
);
const head = part(dog, "SleepyHead", 0.221, 0.301, 0.105);
head.rotation.y = 0.45;
sculpt(
  head,
  [
    [0, 0.036, 0.011, 0.169, 0.147, 0.143],
    [-0.1, -0.014, 0.019, 0.089, 0.102, 0.108],
    [0.1, -0.014, 0.019, 0.089, 0.102, 0.108],
    [0, -0.006, 0.114, 0.086, 0.074, 0.107],
    [0, -0.033, 0.177, 0.055, 0.044, 0.065],
  ],
  vec(0, 0.016, 0.042),
  vec(0.235, 0.21, 0.238),
  0.038,
  white,
  0.0016,
);
oval(head, vec(0, -0.047, 0.236), vec(0.031, 0.023, 0.022), "#252321");
for (const s of [-1, 1]) {
  thread(
    head,
    [
      vec(s * 0.014, -0.068, 0.226),
      vec(s * 0.037, -0.071, 0.202),
      vec(s * 0.052, -0.065, 0.184),
    ],
    0.0024,
    "#82786f",
  );
  // Tapered sleeping lids sit on the curved brow.
  sweep(
    head,
    [
      vec(s * 0.05, 0.056, 0.155),
      vec(s * 0.082, 0.048, 0.15),
      vec(s * 0.115, 0.057, 0.132),
    ],
    (t) => 0.001 + 0.009 * Math.sin(Math.PI * t),
    (t) => 0.001 + 0.005 * Math.sin(Math.PI * t),
    "#382e28",
    10,
    8,
  );
  const ear = part(
    head,
    s < 0 ? "LeftEar" : "RightEar",
    s * 0.101,
    0.12,
    -0.012,
  );
  const pts = [],
    idx = [],
    col = [];
  for (let j = 0; j <= 10; j++) {
    const t = j / 10;
    for (let k = 0; k < 18; k++) {
      const a = (tau * k) / 18,
        taper = (1 - t) ** 0.85;
      pts.push(
        s * 0.052 * t + 0.072 * taper * Math.cos(a),
        t * 0.158,
        -0.026 * t + 0.042 * taper * Math.sin(a),
      );
      col.push(
        ...new T.Color(
          Math.sin(a) > 0.64 && t > 0.13 && t < 0.86 ? "#dec4b4" : white,
        ).toArray(),
      );
      if (j < 10) {
        const u = j * 18 + k,
          v = j * 18 + ((k + 1) % 18);
        idx.push(u, u + 18, v, v, u + 18, v + 18);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  add(ear, g);
}
for (const s of [-1, 1]) {
  const paw = part(
    dog,
    s === 1 ? "NearPaw" : "FarPaw",
    0.18 + s * 0.077,
    0.183,
    0.249,
  );
  oval(paw, vec(0, 0, 0.014), vec(0.065, 0.043, 0.097), white, [0, 0.2, 0]);
  for (const k of [-1, 0, 1])
    oval(paw, vec(k * 0.025, -0.008, 0.085), vec(0.02, 0.022, 0.028), coat);
}
const tail = part(dog, "Plume", -0.34, 0.265, -0.06);
const tailPath = [
  vec(0, 0, 0),
  vec(-0.072, 0.075, 0.094),
  vec(-0.053, 0.142, 0.202),
  vec(0.04, 0.129, 0.269),
  vec(0.17, 0.088, 0.268),
  vec(0.271, 0.056, 0.234),
];
const fluff = (t) =>
  0.019 + 0.094 * Math.sin(Math.PI * (0.08 + 0.91 * t)) ** 0.68;
const plume = sweep(tail, tailPath, fluff, fluff, white, 48, 34);
const arc = new T.CatmullRomCurve3(tailPath),
  plumePos = plume.geometry.attributes.position;
for (let i = 0; i < plumePos.count; i++) {
  const t = Math.floor(i / 34) / 48,
    angle = (tau * (i % 34)) / 34;
  const base = arc.getPointAt(t),
    p = new T.Vector3().fromBufferAttribute(plumePos, i);
  const depth =
    0.038 * Math.cos(angle * 10 - 5 * t) + 0.026 * Math.sin(angle * 15 - 7 * t);
  p.sub(base)
    .multiplyScalar(1 + depth)
    .add(base);
  plumePos.setXYZ(i, p.x, p.y, p.z);
}
plume.geometry.computeVertexNormals();
await save(dog, "leo.glb");

const flowers = new T.Group();
flowers.name = "PinkLilies";
// Each recurved tepal has a pink midrib, a pale margin and a buttery throat.
function blade(parent, length, width, color, leaf = false) {
  const xyz = [],
    rgb = [],
    idx = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    for (let j = 0; j <= 8; j++) {
      const s = j / 4 - 1;
      const spread = width * Math.sin(Math.PI * t) ** 0.76;
      xyz.push(
        s * spread,
        length * (0.92 * t - 0.78 * t ** 3) + spread * 0.22 * s * s,
        length * (0.2 * t + 0.89 * t * t),
      );
      const c = new T.Color(color)
        .lerp(new T.Color(leaf ? "#889668" : "#fff1e4"), Math.abs(s) * 0.76)
        .lerp(
          new T.Color(leaf ? "#637148" : "#ece2a7"),
          Math.max(0, 1 - t * 3),
        );
      rgb.push(...c.toArray());
      if (i < 16 && j < 8) {
        const k = i * 9 + j;
        idx.push(k, k + 9, k + 1, k + 1, k + 9, k + 10);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
  g.computeVertexNormals();
  return add(parent, g);
}
for (const [i, x, y, z, yaw, tilt] of [
  [0, -0.105, 0.267, 0.014, -0.88, 0.47],
  [1, 0.018, 0.418, -0.035, 0.32, 0.26],
  [2, 0.125, 0.238, 0.045, 1.22, 0.52],
]) {
  const stem = part(flowers, "Stem" + i);
  const tip = vec(x, y, z);
  thread(
    stem,
    [vec((i - 1) * 0.016, 0, 0), vec(x * 0.45, y * 0.6, z * 0.38), tip],
    0.0047,
    "#718057",
  );
  for (let k = 0; k < 2; k++) {
    const b = blade(stem, 0.112, 0.017, "#697b4f", true);
    b.position.set(x * (0.3 + 0.3 * k), y * (0.35 + 0.28 * k), z * 0.5);
    b.rotation.y = yaw + 2.7 * k;
  }
  const bloom = part(stem, "Corolla" + i, x, y, z);
  bloom.rotation.set(tilt, yaw, 0.1 * i, "YXZ");
  for (let j = 0; j < 6; j++) {
    const b = blade(
      bloom,
      j % 2 ? 0.137 : 0.124,
      j % 2 ? 0.031 : 0.035,
      j % 2 ? "#e995a7" : "#e6a2af",
    );
    b.rotation.y = (j * tau) / 6;
    b.rotation.x = 0;
    const a = (j * tau) / 6,
      r = 0.032,
      h = 0.103 + (j % 2) * 0.01;
    const end = vec(Math.sin(a) * r, h, Math.cos(a) * r);
    thread(
      bloom,
      [vec(0, 0.003, 0), end.clone().multiplyScalar(0.5), end],
      0.0018,
      "#f3dfb2",
    );
    oval(bloom, end, vec(0.0038, 0.0035, 0.011), "#9c643c", [0.26, a + 0.6, 0]);
  }
  thread(
    bloom,
    [vec(0, 0, 0), vec(0.003, 0.068, 0.003), vec(0.009, 0.125, 0.01)],
    0.0029,
    "#b6bc82",
  );
}
await save(flowers, "pink-lilies.glb");
