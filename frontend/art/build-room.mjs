// Original Sesh assets. Regenerate with: node art/build-room.mjs (from frontend).
import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const output = new URL("../public/atelier/", import.meta.url);
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};
const room = new T.Group(),
  mats = new Map();
function mesh(geo, color, x, y, z, parent = room) {
  if (!mats.has(color))
    mats.set(
      color,
      new T.MeshStandardMaterial({ color, roughness: 0.83, flatShading: true }),
    );
  const m = new T.Mesh(geo, mats.get(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const box = (x, y, z, w, h, d, c) =>
  mesh(new T.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (x, y, z, rt, rb, h, c, n = 12) =>
  mesh(new T.CylinderGeometry(rt, rb, h, n), c, x, y, z);
const ball = (x, y, z, w, h, d, c) => {
  const b = mesh(new T.SphereGeometry(1, 10, 8), c, x, y, z);
  b.scale.set(w, h, d);
  return b;
};
const ink = "#263345",
  wood = "#593e32",
  oak = "#8b6346",
  paper = "#f4dec1",
  blue = "#27332f",
  brass = "#e9ac64",
  red = "#d65e3e";
box(0, -0.19, 0, 6.25, 0.37, 4.85, "#734f49");
for (let j = 0; j < 16; j++) {
  box(
    0,
    0.013,
    -2.28 + j * 0.3,
    6.12,
    0.03,
    0.292,
    ["#76543d", "#805d42", "#6e4e39"][j % 3],
  );
  for (let k = 0; k < 2; k++)
    box(
      -2 + (j % 3) * 0.46 + k * 2,
      0.031,
      -2.28 + j * 0.3,
      0.012,
      0.006,
      0.285,
      "#9d7159",
    );
}
box(-3.02, 1.66, 0, 0.15, 3.34, 4.85, blue);
box(3.07, 1.66, 0, 0.13, 3.34, 4.86, "#393c35");
for (const z of [-2.08, -1.25, -0.42, 0.41, 1.24, 2.07]) {
  box(2.99, 0.54, z, 0.035, 0.94, 0.73, "#504438");
  box(2.96, 0.54, z, 0.025, 0.79, 0.61, "#40392f");
}
box(2.96, 1.04, 0, 0.09, 0.065, 4.85, wood);
box(2.96, 3.18, 0, 0.13, 0.14, 4.84, wood);
// An open, architectural window. Sunlight reaches the salon through the mullions.
box(0, 0.48, -2.35, 6.17, 0.96, 0.16, "#524a3f");
box(-2.91, 2.14, -2.35, 0.32, 2.39, 0.18, blue);
box(2.92, 2.14, -2.35, 0.3, 2.39, 0.18, blue);
box(0, 3.3, -2.35, 6.17, 0.12, 0.2, wood);
box(-3, 3.36, 0, 0.2, 0.06, 4.87, paper);
box(0, 3.36, -2.35, 6.16, 0.06, 0.18, paper);
box(0, 0.16, -2.23, 6.1, 0.22, 0.1, wood);
box(-2.9, 0.16, 0, 0.1, 0.22, 4.75, wood);
// Oiled oak reveals, slender bronze intermediate bars and a deep stone sill.
for (const x of [-2.77, -1.26, 0.5, 2.76]) {
  box(x, 2.13, -2.31, 0.056, 2.46, 0.15, "#503f30");
  box(x + 0.008, 2.13, -2.22, 0.016, 2.43, 0.011, "#aa8153");
}
box(0, 0.99, -2.26, 5.79, 0.13, 0.34, oak);
box(0, 2.93, -2.3, 5.56, 0.036, 0.082, "#68503b");
for (let i = 0; i < 9; i++) {
  const x = -2.71 + i * 0.68;
  box(x, 0.47, -2.245, 0.026, 0.88, 0.038, wood);
}
// Built-in library on the blue wall.
const bookCols = [
  "#79694b",
  "#784c3e",
  "#a1947b",
  "#50676a",
  "#686a50",
  "#715b5c",
  "#384553",
];
for (let row = 0; row < 3; row++) {
  const h = 1.05 + row * 0.8;
  box(-2.7, h, -0.45, 0.54, 0.085, 2.95, oak);
  for (let j = 0; j < 14; j++) {
    const ht = 0.28 + ((row * 13 + j * 7) % 9) * 0.037,
      w = 0.1 + (j % 3) * 0.02,
      z = -1.75 + j * 0.19;
    box(-2.67, h + 0.045 + ht / 2, z, 0.37, ht, w, bookCols[(row * 2 + j) % 7]);
    box(-2.476, h + 0.12, z, 0.012, 0.025, w * 0.75, brass);
  }
}
for (const z of [-1.96, 1.06]) box(-2.69, 1.91, z, 0.52, 2.49, 0.075, wood);
// Woven rug, banded edges.
box(-0.4, 0.046, 0.4, 3.5, 0.04, 2.12, "#744c43");
for (let j = 0; j < 11; j++) {
  box(-0.4, 0.07, -0.51 + j * 0.18, 3.4, 0.008, 0.014, "#987962");
}
for (const x of [-2.04, 1.24]) box(x, 0.075, 0.4, 0.056, 0.008, 2.1, paper);
// Salon grand: a curved bentwood rim, exposed soundboard, strings and raised lid.
const px = -1.04;
function grandShell(y, height, color, scale = 1) {
  const sh = new T.Shape();
  sh.moveTo(-1.12, 0.52);
  sh.lineTo(1.1, 0.52);
  sh.lineTo(1.1, -0.03);
  sh.bezierCurveTo(1.04, -0.44, 0.56, -0.43, 0.44, -0.72);
  sh.bezierCurveTo(0.29, -1.17, 0.1, -1.34, -0.54, -1.34);
  sh.bezierCurveTo(-0.92, -1.34, -1.12, -1.16, -1.12, -0.86);
  sh.closePath();
  const g = new T.ExtrudeGeometry(sh, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments: 24,
  });
  g.rotateX(Math.PI / 2);
  const m = mesh(g, color, px, y, -1.0);
  m.scale.setScalar(scale);
  return m;
}
grandShell(1.17, 0.22, "#252321");
grandShell(1.182, 0.014, "#aa8148", 0.957);
const lid = grandShell(1.21, 0.052, "#242321");
lid.geometry.translate(1.12, 0, 0);
lid.position.x -= 1.12;
lid.rotation.z = 0.31;
for (let i = 0; i < 32; i++) {
  const x = -2.06 + i * 0.054,
    len = 1.48 - Math.max(0, i - 16) * 0.048;
  box(x, 1.198, -0.55 - len / 2, 0.009, 0.008, len, "#ecc98b");
}
const prop = box(px + 0.67, 1.5, -1.16, 0.035, 0.62, 0.034, brass);
prop.rotation.z = -0.14;
for (const [x, z] of [
  [px - 0.94, -0.6],
  [px + 0.94, -0.6],
  [px - 0.4, -2.05],
]) {
  cyl(x, 0.48, z, 0.105, 0.048, 0.9, "#503734");
  cyl(x, 0.09, z, 0.075, 0.075, 0.06, brass);
  ball(x, 0.047, z, 0.065, 0.04, 0.05, ink);
}
box(px, 0.966, -0.42, 2.3, 0.12, 0.52, "#422c2d");
box(px, 0.985, -0.147, 2.3, 0.04, 0.026, brass);
for (let j = 0; j < 36; j++) {
  let x = px - 1.046 + j * 0.06;
  box(x, 1.042, -0.393, 0.058, 0.055, 0.38, paper);
  if (![2, 6].includes(j % 7) && j < 35)
    box(x + 0.029, 1.088, -0.453, 0.037, 0.046, 0.23, ink);
}
box(px, 1.32, -0.81, 0.75, 0.4, 0.036, "#513730");
for (const x of [px - 0.17, px + 0.17]) {
  box(x, 1.34, -0.783, 0.318, 0.345, 0.016, paper);
  for (let r = 0; r < 9; r++)
    box(x, 1.22 + r * 0.028, -0.771, 0.26, 0.003, 0.006, wood);
  for (let n = 0; n < 7; n++)
    ball(
      x - 0.12 + n * 0.037,
      1.25 + (n % 4) * 0.029,
      -0.764,
      0.012,
      0.007,
      0.003,
      ink,
    );
}
mesh(
  new RoundedBoxGeometry(0.95, 0.14, 0.47, 3, 0.045),
  "#543c32",
  px,
  0.6,
  0.23,
);
for (let i = 0; i < 4; i++)
  for (let j = 0; j < 2; j++)
    ball(
      px - 0.31 + i * 0.2,
      0.674,
      0.14 + j * 0.17,
      0.017,
      0.005,
      0.017,
      "#392c27",
    );
box(px, 1.106, -0.59, 2.2, 0.102, 0.047, "#312925");
box(px, 1.15, -0.565, 2.16, 0.008, 0.012, brass);
for (const x of [px - 0.35, px + 0.35])
  for (const z of [0.05, 0.41]) cyl(x, 0.3, z, 0.05, 0.035, 0.53, wood);
for (let x = 0; x < 3; x++)
  box(px - 0.1 + x * 0.1, 0.13, -0.64, 0.058, 0.034, 0.24, brass);
// Drafting table, tapered lamp, books, open notebook, cup and pencil tin.
for (const x of [1.07, 2.58])
  for (const z of [-0.61, 0.42]) box(x, 0.51, z, 0.1, 1.02, 0.1, wood);
box(1.83, 1.04, -0.1, 1.83, 0.12, 1.28, oak);
box(1.83, 0.88, -0.54, 1.7, 0.22, 0.13, wood);
cyl(2.42, 1.14, -0.41, 0.16, 0.17, 0.07, ink);
cyl(2.42, 1.46, -0.41, 0.025, 0.025, 0.62, brass);
cyl(2.42, 1.84, -0.41, 0.09, 0.28, 0.22, "#e5a342");
for (let j = 0; j < 3; j++) {
  const y = 1.15 + j * 0.09,
    x = 1.27 + 0.018 * Math.sin(j * 2);
  box(x, y, -0.39, 0.59, 0.073, 0.39, "#c6b49a");
  for (const dy of [-0.037, 0.037])
    box(x, y + dy, -0.39, 0.603, 0.009, 0.405, bookCols[j]);
  box(x, y, -0.586, 0.604, 0.082, 0.015, bookCols[j]);
  for (const dy of [-0.017, 0.009, 0.024])
    box(x, y + dy, -0.193, 0.57, 0.002, 0.003, "#ab987d");
}
box(1.87, 1.116, 0.18, 0.62, 0.024, 0.37, paper);
box(1.87, 1.133, 0.18, 0.012, 0.006, 0.37, wood);
for (let j = 0; j < 4; j++)
  box(1.72, 1.134, 0.09 + j * 0.06, 0.2, 0.004, 0.008, "#9d9182");
// Hand-thrown celadon cup, a foot ring, thumb handle, and coffee below the lip.
const cupX = 1.3,
  cupZ = 0.2;
cyl(cupX, 1.114, cupZ, 0.133, 0.108, 0.018, "#a8aa92", 24);
mesh(
  new T.LatheGeometry(
    [
      [0.051, 0],
      [0.06, 0.012],
      [0.065, 0.038],
      [0.094, 0.092],
      [0.097, 0.145],
      [0.092, 0.151],
      [0.084, 0.148],
      [0.081, 0.116],
    ].map(([r, h]) => new T.Vector2(r, h)),
    28,
  ),
  "#b9c5ac",
  cupX,
  1.125,
  cupZ,
);
cyl(cupX, 1.263, cupZ, 0.085, 0.084, 0.003, "#412c24", 28);
const handle = mesh(
  new T.TorusGeometry(0.047, 0.012, 8, 20),
  "#b1bea4",
  cupX + 0.094,
  1.216,
  cupZ,
);
handle.scale.set(1, 0.84, 1);
const pencil = box(2.13, 1.14, 0.26, 0.016, 0.016, 0.29, "#ae7244");
pencil.rotation.y = -0.27;
box(1.81, 0.56, 0.97, 0.54, 0.12, 0.56, wood);
for (const x of [1.61, 2.01])
  for (const z of [0.77, 1.17]) box(x, 0.29, z, 0.065, 0.56, 0.065, ink);
box(1.81, 0.91, 1.2, 0.53, 0.63, 0.09, wood);
// A dwarf olive by the piano. Narrow curved leaves grow along real branches.
let seed = 741;
function random() {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
}
function twig(start, end, r, color) {
  const dir = end.clone().sub(start),
    mid = start.clone().lerp(end, 0.5);
  const stem = mesh(
    new T.CylinderGeometry(r * 0.59, r, dir.length(), 7),
    color,
    mid.x,
    mid.y,
    mid.z,
  );
  stem.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
}
function leafBlade() {
  const g = new T.BufferGeometry();
  g.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, -0.1, 0, -0.044, -0.014, 0.006, 0.044, -0.014, 0.006, 0, 0.096,
        -0.015, 0, 0, 0.02,
      ],
      3,
    ),
  );
  g.setIndex([
    0, 4, 1, 0, 2, 4, 1, 4, 3, 4, 2, 3, 0, 1, 4, 0, 4, 2, 1, 3, 4, 4, 3, 2,
  ]);
  const solid = g.toNonIndexed();
  solid.computeVertexNormals();
  return solid;
}
function olive(x, z, h, spread) {
  const foot = new T.Vector3(x, 0.18, z),
    fork = new T.Vector3(x + 0.035, h * 0.55, z + 0.04);
  twig(foot, fork, 0.032, "#69503a");
  for (let j = 0; j < 17; j++) {
    const a = j * 2.4,
      rad = spread * (0.4 + 0.6 * random()),
      top = new T.Vector3(
        x + rad * Math.cos(a),
        h * (0.52 + 0.46 * random()),
        z + rad * Math.sin(a),
      );
    const start = fork.clone().lerp(foot, random() * 0.6);
    twig(start, top, 0.014, "#745c43");
    for (let k = 0; k < 9; k++) {
      const pt = start.clone().lerp(top, 0.32 + k * 0.08);
      const leaf = mesh(
        leafBlade(),
        ["#576040", "#74784d", "#84845a", "#4d5844"][k % 4],
        pt.x + 0.055 * Math.cos(k * 2),
        pt.y + 0.035,
        pt.z + 0.038 * Math.sin(k * 2),
      );
      leaf.rotation.set(0.45 * Math.sin(a + k), a + k, (k % 2 ? 1 : -1) * 0.94);
    }
  }
}
cyl(-2.27, 0.26, 1.53, 0.26, 0.19, 0.49, "#8e6750", 24);
olive(-2.27, 1.53, 1.78, 0.54);
olive(2.4, -2.86, 3.12, 0.86);
olive(-2.4, -2.98, 2.8, 0.8);
// Upholstered reading chair with curved saddle back and piping.
mesh(
  new RoundedBoxGeometry(0.62, 0.14, 0.59, 3, 0.065),
  "#676a55",
  1.81,
  0.65,
  0.94,
);
const seatBack = mesh(
  new RoundedBoxGeometry(0.64, 0.53, 0.13, 3, 0.09),
  "#78785e",
  1.81,
  0.94,
  1.22,
);
seatBack.rotation.x = 0.1;
for (const side of [-1, 1]) {
  mesh(
    new RoundedBoxGeometry(0.08, 0.085, 0.52, 2, 0.035),
    oak,
    1.81 + side * 0.29,
    0.83,
    0.98,
  );
  cyl(1.81 + side * 0.29, 0.73, 0.84, 0.023, 0.023, 0.25, brass);
}
// Flutes catch the desk lamp's pool of amber.
for (let j = 0; j < 28; j++) {
  const a = (j * 2 * Math.PI) / 28;
  twig(
    new T.Vector3(
      2.42 + 0.279 * Math.cos(a),
      1.735,
      -0.41 + 0.279 * Math.sin(a),
    ),
    new T.Vector3(
      2.42 + 0.091 * Math.cos(a),
      1.948,
      -0.41 + 0.091 * Math.sin(a),
    ),
    0.0035,
    "#d2aa6e",
  );
}
// Ceramic vase, recurved lily petals, and understated brass picture rails.
box(2.58, 0.56, -2.08, 0.6, 1.12, 0.52, wood);
box(2.58, 1.13, -2.08, 0.66, 0.06, 0.58, oak);
cyl(2.6, 1.32, -1.96, 0.09, 0.15, 0.32, "#ede4c9");
for (let k = 0; k < 3; k++) {
  let x = 2.54 + k * 0.082,
    y = 1.65 + (k % 2) * 0.16;
  box(x, y - 0.11, -1.94, 0.014, 0.33, 0.014, "#74855f");
  for (let j = 0; j < 6; j++) {
    let a = j * 1.047;
    const petal = ball(
      x + Math.cos(a) * 0.054,
      y + 0.035,
      -1.94 + Math.sin(a) * 0.054,
      0.031,
      0.088,
      0.041,
      ["#e6aaa9", "#ecc2b9"][j % 2],
    );
    petal.rotation.z = -Math.cos(a) * 0.77;
    petal.rotation.x = Math.sin(a) * 0.77;
  }
  ball(x, y + 0.035, -1.94, 0.019, 0.035, 0.018, brass);
}
for (let j = 0; j < 14; j++) {
  let z = -2.1 + j * 0.32;
  box(-2.78, 0.29, z, 0.04, 0.27, 0.025, oak);
}
for (let j = 0; j < 32; j++) {
  let z = -2.2 + j * 0.14;
  box(
    -0.85 + Math.sin(j * 3) * 0.75,
    0.034,
    z,
    1.2 + (j % 4) * 0.22,
    0.002,
    0.009,
    "#b58564",
  );
}
room.updateMatrixWorld(true);
const pack = async (obj, name, clips = []) =>
  writeFileSync(
    new URL(name, output),
    Buffer.from(
      await new GLTFExporter().parseAsync(obj, {
        binary: true,
        animations: clips,
      }),
    ),
  );
const geometries = [];
room.traverse((m) => {
  if (!m.isMesh) return;
  const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
  g.applyMatrix4(m.matrixWorld);
  g.deleteAttribute("uv");
  const rgb = [];
  for (let i = 0; i < g.attributes.position.count; i++)
    rgb.push(
      ...(g.attributes.color
        ? new T.Color().fromBufferAttribute(g.attributes.color, i)
        : m.material.color
      ).toArray(),
    );
  g.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
  geometries.push(g);
});
const batch = new T.Mesh(
  mergeGeometries(geometries),
  new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 }),
);
batch.name = "Atelier";
await pack(batch, "room.glb");
// Offline orthographic render shares actual geometry, including all 29 piano keys.
const W = 1100,
  H = 790,
  rgba = Buffer.alloc(W * H * 4),
  depth = new Float32Array(W * H).fill(Infinity);
const cam = new T.OrthographicCamera(-4.85, 4.85, 3.48, -3.48, 0.1, 100);
cam.position.set(8, 6.8, 9);
cam.lookAt(0, 1.35, 0);
cam.updateMatrixWorld();
const dir = new T.Vector3(-0.38, 0.95, 0.48).normalize(),
  pos = batch.geometry.attributes.position,
  norm = batch.geometry.attributes.normal,
  col = batch.geometry.attributes.color;
for (let i = 0; i < pos.count; i += 3) {
  const v = [0, 1, 2]
    .map((o) => new T.Vector3().fromBufferAttribute(pos, i + o).project(cam))
    .map((p) => [((p.x + 1) * W) / 2, ((1 - p.y) * H) / 2, p.z]);
  const [a, b, c] = v,
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (den >= -1e-8) continue;
  const n = new T.Vector3().fromBufferAttribute(norm, i);
  const shade = 0.65 + 0.47 * Math.max(0, n.dot(dir));
  const color = new T.Color()
    .fromBufferAttribute(col, i)
    .multiplyScalar(shade)
    .convertLinearToSRGB();
  for (
    let y = Math.max(0, Math.floor(Math.min(...v.map((p) => p[1]))));
    y <= Math.min(H - 1, Math.ceil(Math.max(...v.map((p) => p[1]))));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(...v.map((p) => p[0]))));
      x <= Math.min(W - 1, Math.ceil(Math.max(...v.map((p) => p[0]))));
      x++
    ) {
      let u =
          ((b[1] - c[1]) * (x + 0.5 - c[0]) +
            (c[0] - b[0]) * (y + 0.5 - c[1])) /
          den,
        vv =
          ((c[1] - a[1]) * (x + 0.5 - c[0]) +
            (a[0] - c[0]) * (y + 0.5 - c[1])) /
          den,
        w = 1 - u - vv;
      if (Math.min(u, vv, w) < 0) continue;
      let z = u * a[2] + vv * b[2] + w * c[2],
        k = y * W + x;
      if (z >= depth[k]) continue;
      depth[k] = z;
      for (let q = 0; q < 3; q++)
        rgba[k * 4 + q] = Math.min(
          255,
          Math.round([color.r, color.g, color.b][q] * 255),
        );
      rgba[k * 4 + 3] = 255;
    }
}
const crc = (b) => {
  let c = -1;
  for (const v of b) {
    c ^= v;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ -1) >>> 0;
};
const chunk = (tag, data) => {
  let b = Buffer.concat([Buffer.from(tag), data]),
    l = Buffer.alloc(4),
    r = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  r.writeUInt32BE(crc(b));
  return Buffer.concat([l, b, r]);
};
let ih = Buffer.alloc(13);
ih.writeUInt32BE(W);
ih.writeUInt32BE(H, 4);
ih[8] = 8;
ih[9] = 6;
let rows = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++)
  rgba.copy(rows, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
writeFileSync(
  new URL("plate.png", output),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ih),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
// Segmented skinned marionette. Independent shoulders, elbows, hips and knees.
const dancer = new T.Group(),
  bones = [],
  parts = [];
function joint(name, x, y, z, parent) {
  const b = new T.Bone();
  b.name = name;
  b.position.set(x, y, z);
  (parent || dancer).add(b);
  bones.push(b);
  return b;
}
const hips = joint("Pelvis", 0, 0.72, 0),
  spine = joint("Spine", 0, 0.08, 0, hips),
  head = joint("Head", 0, 0.48, 0, spine);
// A single indexed skin. Turned profiles shape the cloth and face; all details
// are baked in, so the knit pattern and hair locks add no material switches.
function profile(rows, segments = 28) {
  const g = new T.LatheGeometry(
    rows.map(([y, r]) => new T.Vector2(r, y)),
    segments,
  );
  return g;
}
function piece(b, x, y, z, w, h, d, color, shape = null, rotation = [0, 0, 0]) {
  dancer.updateMatrixWorld(true);
  const g = shape || new T.SphereGeometry(1, 14, 10);
  g.scale(w, h, d);
  const rgb = [],
    idx = [],
    weights = [];
  for (let i = 0; i < g.attributes.position.count; i++) {
    const pos = g.attributes.position;
    const co = new T.Color(
      typeof color === "function"
        ? color(pos.getX(i), pos.getY(i), pos.getZ(i))
        : color,
    );
    rgb.push(co.r, co.g, co.b);
    idx.push(bones.indexOf(b), 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  g.applyMatrix4(
    new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)),
  );
  g.translate(x, y, z);
  g.applyMatrix4(b.matrixWorld);
  g.deleteAttribute("uv");
  g.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  parts.push(g);
}
const wool = "#607e76",
  seam = "#415f58",
  ivory = "#dbcab0",
  ochre = "#ba8860",
  skinTone = "#cc956e";
const rib = (x, y, z) => (Math.cos(Math.atan2(x, z) * 24) > 0 ? seam : wool);
// Boxy dropped shoulders, tucked hem, roll neck, and a two-colour stitch yoke.
const sweaterRows = [
  [-0.073, 0.147],
  [-0.06, 0.183],
  [-0.014, 0.188],
  [0.006, 0.211],
  [0.12, 0.225],
  [0.242, 0.229],
  [0.267, 0.231],
  [0.283, 0.232],
  [0.3, 0.235],
  [0.317, 0.234],
  [0.335, 0.231],
  [0.35, 0.219],
  [0.39, 0.195],
  [0.423, 0.13],
  [0.437, 0.074],
];
piece(
  spine,
  0,
  0,
  0.004,
  1,
  1,
  0.75,
  (x, y, z) => {
    if (y < -0.013) return rib(x, y, z);
    if (y > 0.26 && y < 0.35) {
      const st =
        Math.round(((Math.atan2(x, z / 0.75) + Math.PI) * 64) / (Math.PI * 2)) %
        8;
      const row = Math.round((y - 0.267) / 0.016);
      if (row === 0 || row === 5) return ochre;
      if (Math.min(st, 8 - st) === Math.abs(row - 2)) return ivory;
    }
    return wool;
  },
  profile(sweaterRows, 64),
);
piece(
  spine,
  0,
  0.41,
  0.002,
  1,
  1,
  0.8,
  rib,
  profile(
    [
      [0, 0.081],
      [0.008, 0.113],
      [0.052, 0.112],
      [0.061, 0.089],
    ],
    48,
  ),
);
piece(hips, 0, 0.008, 0, 0.186, 0.148, 0.138, "#434851");
piece(
  head,
  0,
  0.077,
  0.005,
  1,
  1,
  0.93,
  skinTone,
  profile([
    [-0.086, 0.051],
    [-0.04, 0.065],
    [-0.007, 0.083],
    [0.023, 0.107],
    [0.065, 0.13],
    [0.119, 0.146],
    [0.181, 0.14],
    [0.24, 0.107],
    [0.266, 0.028],
  ]),
);
piece(head, 0, 0.154, -0.128, 0.028, 0.042, 0.033, "#ca906a");
piece(head, 0, 0.125, -0.148, 0.033, 0.022, 0.027, "#cf9573");
piece(head, 0, 0.096, -0.126, 0.031, 0.006, 0.01, "#955e51");
// Sculpted hairline dips at the neck and lifts over the brows.
const hair = new T.SphereGeometry(1, 80, 26);
const hairPos = hair.attributes.position;
for (let i = 0; i < hairPos.count; i++) {
  const x = hairPos.getX(i),
    y = hairPos.getY(i),
    z = hairPos.getZ(i),
    angle = Math.atan2(x, z);
  const edge = 1.53 + 0.44 * Math.cos(angle) + 0.1 * Math.sin(3 * angle + 0.4);
  const t = (Math.acos(Math.min(1, Math.max(-1, y))) / Math.PI) * edge;
  const ridge =
    1 +
    0.029 *
      Math.sin(13 * angle - 2.8 * t + 0.35 * Math.sin(t * 3)) *
      Math.sin(t);
  hairPos.setXYZ(
    i,
    ridge * Math.sin(t) * Math.sin(angle),
    ridge * Math.cos(t),
    ridge * Math.sin(t) * Math.cos(angle),
  );
}
hair.computeVertexNormals();
piece(
  head,
  0,
  0.189,
  0.014,
  0.159,
  0.166,
  0.152,
  (x, y, z) => {
    const theta = Math.atan2(x / 0.159, z / 0.152),
      t = Math.acos(Math.min(1, Math.max(-1, y / 0.166)));
    return Math.sin(13 * theta - 2.8 * t + 0.35 * Math.sin(t * 3)) > 0.62
      ? "#554239"
      : "#44352e";
  },
  hair,
);
for (let i = 0; i < 3; i++)
  piece(
    head,
    -0.062 + i * 0.041,
    0.278 - i * 0.01,
    -0.09,
    0.045,
    0.043,
    0.082,
    "#503d32",
    null,
    [-0.45, 0.5, -0.4],
  );
for (const s of [-1, 1]) {
  piece(head, s * 0.138, 0.146, -0.003, 0.027, 0.042, 0.029, skinTone);
  piece(head, s * 0.153, 0.146, -0.01, 0.012, 0.024, 0.014, "#b37a61");
  piece(head, s * 0.06, 0.178, -0.122, 0.021, 0.009, 0.011, "#473931", null, [
    0,
    s * 0.27,
    s * 0.06,
  ]);
  piece(head, s * 0.06, 0.204, -0.12, 0.027, 0.008, 0.01, "#503d32", null, [
    0,
    s * 0.27,
    s * 0.08,
  ]);
  // Fine burnished metal frames, visible in profile as well as from the piano.
  piece(
    head,
    s * 0.059,
    0.18,
    -0.134,
    1,
    0.82,
    1,
    "#86705b",
    new T.TorusGeometry(0.046, 0.004, 5, 24),
    [0, -s * 0.26, 0],
  );
  piece(head, s * 0.116, 0.185, -0.07, 0.004, 0.004, 0.063, "#89725b", null, [
    0,
    s * 0.28,
    0,
  ]);
  if (s === 1) piece(head, 0, 0.185, -0.144, 0.018, 0.004, 0.004, "#89725b");
  const side = s < 0 ? "L" : "R";
  const arm = joint("Arm" + side, s * 0.183, 0.361, 0, spine);
  const fore = joint("Fore" + side, 0, -0.245, 0, arm);
  piece(
    arm,
    0,
    0,
    0,
    1,
    1,
    1,
    wool,
    profile([
      [-0.275, 0.071],
      [-0.239, 0.084],
      [-0.114, 0.096],
      [-0.04, 0.094],
      [0.019, 0.085],
      [0.057, 0.054],
      [0.072, 0.021],
    ]),
  );
  piece(
    fore,
    0,
    0,
    0,
    1,
    1,
    0.94,
    wool,
    profile([
      [-0.231, 0.051],
      [-0.218, 0.065],
      [-0.176, 0.078],
      [-0.082, 0.084],
      [-0.023, 0.081],
      [0.028, 0.071],
      [0.049, 0.046],
    ]),
  );
  piece(
    fore,
    0,
    -0.247,
    0,
    1,
    1,
    0.96,
    rib,
    profile(
      [
        [0, 0.048],
        [0.006, 0.058],
        [0.051, 0.062],
        [0.058, 0.061],
      ],
      48,
    ),
  );
  const hand = joint("Hand" + side, 0, -0.258, 0, fore);
  piece(hand, 0, -0.025, -0.011, 0.053, 0.053, 0.037, skinTone);
  piece(hand, -s * 0.045, -0.046, -0.008, 0.022, 0.039, 0.021, skinTone, null, [
    0.15,
    0,
    -s * 0.46,
  ]);
  for (let f = 0; f < 4; f++) {
    const finger = joint(
      "Finger" + side + f,
      (f - 1.5) * 0.025,
      -0.056,
      -0.014,
      hand,
    );
    piece(
      finger,
      0,
      -0.025,
      -0.004,
      0.012,
      0.03 + (f === 1 ? 0.008 : 0),
      0.014,
      "#d79e77",
      null,
      [0.18, 0, 0],
    );
  }
  const leg = joint("Leg" + side, s * 0.103, 0, 0, hips),
    shin = joint("Shin" + side, 0, -0.31, 0, leg);
  piece(
    leg,
    0,
    0,
    0,
    1,
    1,
    1.02,
    "#47515a",
    profile([
      [-0.35, 0.072],
      [-0.307, 0.084],
      [-0.1, 0.103],
      [0.026, 0.099],
      [0.057, 0.079],
    ]),
  );
  piece(
    shin,
    0,
    0,
    0,
    1,
    1,
    1,
    "#47515a",
    profile([
      [-0.29, 0.057],
      [-0.257, 0.075],
      [-0.2, 0.069],
      [-0.113, 0.082],
      [-0.038, 0.08],
      [0.018, 0.073],
    ]),
  );
  piece(
    shin,
    0,
    -0.255,
    0,
    1,
    1,
    1,
    "#59616a",
    profile([
      [-0.032, 0.061],
      [-0.026, 0.073],
      [0.006, 0.077],
    ]),
  );
  piece(shin, 0, -0.309, -0.041, 0.076, 0.037, 0.137, "#806852");
  piece(shin, 0, -0.29, -0.055, 0.074, 0.051, 0.127, "#ae9173");
  piece(shin, 0, -0.264, -0.03, 0.071, 0.023, 0.079, "#d1b99b");
}
const skin = new T.SkinnedMesh(
  mergeGeometries(parts),
  new T.MeshStandardMaterial({ vertexColors: true }),
);
dancer.add(skin);
skin.bind(new T.Skeleton(bones));
skin.name = "Pianist";
const track = (n, ts, angles) =>
  new T.QuaternionKeyframeTrack(
    n + ".quaternion",
    ts,
    angles.flatMap((a) =>
      new T.Quaternion().setFromEuler(new T.Euler(a, 0, 0)).toArray(),
    ),
  );
const ts = [0, 0.25, 0.5, 0.75, 1],
  clips = [
    new T.AnimationClip("Walk", 1, [
      track("LegL", ts, [0.38, 0, -0.38, 0, 0.38]),
      track("LegR", ts, [-0.38, 0, 0.38, 0, -0.38]),
      track("ArmL", ts, [-0.2, 0, 0.2, 0, -0.2]),
      track("ArmR", ts, [0.2, 0, -0.2, 0, 0.2]),
    ]),
  ];
function playing(phase = 0) {
  return ["L", "R"].flatMap((s, i) => [
    track(
      "Leg" + s,
      ts,
      ts.map(() => 1.38),
    ),
    track(
      "Shin" + s,
      ts,
      ts.map(() => -1.45),
    ),
    track(
      "Arm" + s,
      ts,
      ts.map((t) => 0.62 + phase * 0.12 * Math.sin(2 * Math.PI * t + i * 3)),
    ),
    track(
      "Fore" + s,
      ts,
      ts.map((t) => 1.03 + phase * 0.19 * Math.cos(2 * Math.PI * t + i * 3)),
    ),
  ]);
}
clips.push(
  new T.AnimationClip("Seated", 1, playing()),
  new T.AnimationClip("Perform", 1, [
    ...playing(1),
    track("Head", ts, [0.07, 0.12, 0.08, 0.04, 0.07]),
  ]),
);
const play = clips.find((c) => c.name === "Perform");
play.tracks.push(track("Spine", ts, [0.09, 0.12, 0.1, 0.07, 0.09]));
for (const side of ["L", "R"]) {
  play.tracks.push(track("Hand" + side, ts, [0.14, 0.28, 0.03, 0.23, 0.14]));
  for (let f = 0; f < 4; f++)
    play.tracks.push(
      track(
        "Finger" + side + f,
        ts,
        ts.map(
          (t) =>
            0.16 +
            0.21 *
              Math.cos((t + f / 4 + (side === "R" ? 0.5 : 0)) * Math.PI * 2),
        ),
      ),
    );
}
for (const [name, reverse] of [
  ["Sit", false],
  ["Stand", true],
]) {
  const tracks = [];
  for (const side of ["L", "R"])
    for (const [bone, angle] of [
      ["Leg", 1.38],
      ["Shin", -1.45],
      ["Arm", 0.86],
      ["Fore", 1.09],
    ])
      tracks.push(
        track(
          bone + side,
          [0, 0.6, 1],
          reverse ? [angle, angle * 0.4, 0] : [0, angle * 0.67, angle],
        ),
      );
  tracks.push(
    track("Spine", [0, 0.5, 1], reverse ? [0.09, 0.22, 0] : [0, 0.22, 0.09]),
  );
  clips.push(new T.AnimationClip(name, 1, tracks));
}
// Wrist and fingertip gestures follow the actual 32-note, 13.76 s étude.
const notes = [
  48, 55, 62, 64, 67, 64, 62, 55, 45, 52, 59, 60, 64, 60, 59, 52, 41, 48, 55,
  57, 60, 57, 55, 48, 43, 50, 57, 59, 62, 59, 57, 50,
];
const beatTimes = Array.from({ length: 129 }, (_, j) => (j * 0.43) / 4);
play.duration = 13.76;
for (const side of ["L", "R"]) {
  for (const [bone, neutral] of [
    ["Arm", 0.83],
    ["Fore", 1.04],
    ["Hand", 0.11],
    ...[0, 1, 2, 3].map((f) => ["Finger" + side + f, 0.1]),
  ]) {
    const name = bone.startsWith("Finger") ? bone : bone + side;
    play.tracks = play.tracks.filter((tr) => !tr.name.startsWith(name + "."));
    const qs = beatTimes.flatMap((time, j) => {
      const i = Math.floor(j / 4) % 32,
        phase = j % 4,
        pulse = [0.65, 1, 0.32, 0][phase],
        active = side === "R" ? i % 2 === 1 : i % 2 === 0;
      const touch = active ? pulse : 0;
      const pitch = (notes[i] - 56) / 16;
      let angle =
        neutral -
        (bone === "Fore"
          ? 0.11
          : bone === "Arm"
            ? 0.05
            : bone === "Hand"
              ? 0.21
              : 0.26) *
          touch;
      if (bone.startsWith("Finger") && i % 4 !== Number(bone.slice(-1)))
        angle = 0.08;
      const yaw = bone === "Fore" ? pitch * 0.34 : 0;
      return new T.Quaternion()
        .setFromEuler(new T.Euler(angle, yaw, 0))
        .toArray();
    });
    play.tracks.push(
      new T.QuaternionKeyframeTrack(name + ".quaternion", beatTimes, qs),
    );
  }
}
clips.push(
  new T.AnimationClip("Idle", 1, [
    track("Spine", ts, [0, 0.01, 0.015, 0.007, 0]),
  ]),
);
// Breath and phrasing span whole bars. Independent lateral weight shifts and
// glances toward the keys resolve to the first pose at each loop boundary.
function gesture(name, duration, sample) {
  const times = Array.from({ length: 65 }, (_, j) => (duration * j) / 64);
  return new T.QuaternionKeyframeTrack(
    name + ".quaternion",
    times,
    times.flatMap((t) =>
      new T.Quaternion()
        .setFromEuler(new T.Euler(...sample((t * 2 * Math.PI) / duration)))
        .toArray(),
    ),
  );
}
const seated = clips.find((c) => c.name === "Seated");
seated.duration = 4.8;
for (const side of ["L", "R"]) {
  seated.tracks = seated.tracks.filter(
    (t) =>
      !t.name.startsWith("Arm" + side + ".") &&
      !t.name.startsWith("Fore" + side + "."),
  );
  seated.tracks.push(
    gesture("Arm" + side, 4.8, (t) => [0.48 + 0.014 * Math.cos(t), 0, 0]),
    gesture("Fore" + side, 4.8, (t) => [0.92, 0, 0]),
  );
}
for (const [clip, performance] of [
  [play, true],
  [seated, false],
]) {
  clip.tracks = clip.tracks.filter(
    (t) => !["Head.quaternion", "Spine.quaternion"].includes(t.name),
  );
  clip.tracks.push(
    gesture("Spine", clip.duration, (t) => [
      -0.065 + 0.024 * Math.sin(t * (performance ? 3 : 1)),
      0.023 * Math.sin(t),
      0.016 * Math.cos(t),
    ]),
    gesture("Head", clip.duration, (t) => [
      -0.115 + 0.033 * Math.sin(t * (performance ? 2 : 1) + 0.2),
      0.073 * Math.sin(t - 0.7),
      0.025 * Math.cos(t + 0.3),
    ]),
  );
}
const walkClip = clips[0];
walkClip.tracks.push(
  gesture("Spine", 1, (t) => [0.018, 0.059 * Math.sin(t), 0.033 * Math.cos(t)]),
  gesture("Head", 1, (t) => [
    0.04 + 0.018 * Math.cos(2 * t),
    -0.035 * Math.sin(t),
    -0.016 * Math.cos(t),
  ]),
);
for (const [i, side] of ["L", "R"].entries())
  walkClip.tracks.push(
    gesture("Shin" + side, 1, (t) => [
      -0.07 - 0.38 * Math.max(0, Math.sin(t + i * Math.PI)),
      0,
      0,
    ]),
  );
// Bake fingertip contact against the modeled white keys. Keep this small
// elbow correction in the clip rather than solving IK during a study session.
const measure = new T.AnimationMixer(dancer);
measure.clipAction(play).play();
const solved = { L: [], R: [] };
for (let j = 0; j < beatTimes.length; j++) {
  measure.setTime(beatTimes[j] % play.duration);
  const note = Math.floor(j / 4) % 32;
  for (const side of ["L", "R"]) {
    const fore = dancer.getObjectByName("Fore" + side),
      finger = dancer.getObjectByName("Finger" + side + (note % 4));
    const base = fore.quaternion.clone();
    const touch =
      note % 2 === (side === "L" ? 0 : 1) ? [0.55, 1, 0.35, 0][j % 4] : 0;
    const target = 1.071 + 0.07 + 0.04 * (1 - touch);
    let lo = -0.55,
      hi = 0.55;
    for (let k = 0; k < 12; k++) {
      const ang = (lo + hi) / 2;
      fore.quaternion
        .copy(base)
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), ang),
        );
      const tip = finger.localToWorld(new T.Vector3(0, -0.055, 0));
      if (tip.y < target) lo = ang;
      else hi = ang;
    }
    solved[side].push(...fore.quaternion.toArray());
    fore.quaternion.copy(base);
  }
}
measure.stopAllAction();
for (const side of ["L", "R"]) {
  const name = "Fore" + side + ".quaternion";
  play.tracks = play.tracks.filter((t) => t.name !== name);
  play.tracks.push(
    new T.QuaternionKeyframeTrack(name, beatTimes, solved[side]),
  );
}
await pack(dancer, "pianist.glb", clips);
