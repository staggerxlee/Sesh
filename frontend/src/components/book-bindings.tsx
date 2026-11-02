"use client";
import * as T from "three";
import { useMemo, useEffect } from "react";
const titles = [
  "NOCTURNES",
  "ÉTUDES",
  "THE LONG VIEW",
  "FIELD NOTES",
  "PRELUDES",
  "WOOD & LIGHT",
  "COLLECTED WORKS",
];
const cloth = [
  "#78614d",
  "#68443b",
  "#9a8771",
  "#415b5c",
  "#5b604a",
  "#675153",
  "#394954",
];
// An original typeset spine atlas, shared by every shelf and drawn in one pass.
export function BookBindings() {
  const { map, geometry } = useMemo(() => {
    const sheet = document.createElement("canvas");
    sheet.width = 1024;
    sheet.height = 1024;
    const ctx = sheet.getContext("2d")!;
    const points: number[] = [],
      uv: number[] = [];
    for (let row = 0; row < 3; row++)
      for (let j = 0; j < 14; j++) {
        const n = row * 14 + j,
          col = n % 8,
          line = Math.floor(n / 8);
        const x = col * 128,
          y = line * 160,
          edition = (row * 2 + j) % 7;
        ctx.fillStyle = cloth[edition];
        ctx.fillRect(x, y, 128, 160);
        const edge = ctx.createLinearGradient(x, 0, x + 128, 0);
        edge.addColorStop(0, "#120e0b88");
        edge.addColorStop(0.17, "#ffdfae19");
        edge.addColorStop(0.83, "#0000");
        edge.addColorStop(1, "#130e0d99");
        ctx.fillStyle = edge;
        ctx.fillRect(x, y, 128, 160);
        ctx.fillStyle = "#dac092";
        for (const h of [10, 13, 137, 145])
          ctx.fillRect(x + 6, y + h, 116, 1.5);
        ctx.save();
        ctx.translate(x + 67, y + 73);
        ctx.rotate(-Math.PI / 2);
        ctx.font = "12px Georgia";
        ctx.textAlign = "center";
        ctx.fillText(titles[edition], 0, 0, 101);
        ctx.restore();
        ctx.font = "11px Georgia";
        ctx.fillStyle = "#ebdbbd";
        ctx.textAlign = "center";
        ctx.fillText(["I", "II", "III", "IV"][j % 4], x + 64, y + 132);
        const base = 1.05 + row * 0.8 + 0.045,
          height = 0.28 + ((row * 13 + j * 7) % 9) * 0.037;
        const z = -1.75 + j * 0.19,
          w = 0.1 + (j % 3) * 0.02,
          left = z + w / 2,
          right = z - w / 2;
        const corners = [
          [left, base, 0, 1],
          [right, base, 1, 1],
          [right, base + height, 1, 0],
          [left, base + height, 0, 0],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [sz, sy, u, v] = corners[k];
          points.push(-2.466, sy, sz);
          uv.push((x + 1 + 126 * u) / 1024, 1 - (y + 1 + 158 * v) / 1024);
        }
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(points, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const map = new T.CanvasTexture(sheet);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    return { geometry, map };
  }, []);
  useEffect(
    () => () => {
      map.dispose();
      geometry.dispose();
    },
    [map, geometry],
  );
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={map} roughness={0.88} />
    </mesh>
  );
}
