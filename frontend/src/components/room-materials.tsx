"use client";
import { useEffect, useMemo } from "react";
import * as T from "three";
// Baked vertex colors preserve one draw call. Warm surfaces receive a low-contrast
// grain in model space, so it remains stationary as the camera travels.
export function finishWood(material: T.MeshStandardMaterial) {
  if (material.userData.atelierGrain) return;
  material.userData.atelierGrain = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 salonPosition;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nsalonPosition=position;",
      );
    shader.fragmentShader =
      "varying vec3 salonPosition;\n" +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat timber=smoothstep(0.025,0.18,diffuseColor.r-diffuseColor.b);float curl=sin(salonPosition.x*3.7+salonPosition.y*2.3);float vein=sin(salonPosition.z*33.0+salonPosition.y*29.0+curl*3.4+sin(salonPosition.x*7.9+salonPosition.z*9.2));diffuseColor.rgb*=1.0+timber*0.056*vein;",
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
      float inPiano=step(salonPosition.x,.14)*step(-2.25,salonPosition.x)*step(salonPosition.z,-.13)*step(.78,salonPosition.y);
      float lacquer=inPiano*(1.-smoothstep(.025,.065,max(diffuseColor.r,max(diffuseColor.b,diffuseColor.g))));
      roughnessFactor=mix(roughnessFactor,.23,lacquer);`,
        );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float lampshade=step(1.72,salonPosition.y)*step(salonPosition.y,1.96)*step(length(salonPosition.xz-vec2(2.42,-.41)),.285);
      float fluting=.8+.2*cos(28.*atan(salonPosition.x-2.42,salonPosition.z+.41));
      totalEmissiveRadiance+=lampshade*fluting*vec3(.83,.42,.14);`,
    );
  };
  material.customProgramCacheKey = () => "salon-veneer-v1";
  material.needsUpdate = true;
}
export function WindowLight({ warm }: { warm: boolean }) {
  const map = useMemo(() => {
    const sheet = document.createElement("canvas");
    sheet.width = 256;
    sheet.height = 256;
    const ctx = sheet.getContext("2d")!;
    ctx.filter = "blur(4px)";
    ctx.fillStyle = "#fff3ca";
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 2; y++)
        ctx.fillRect(14 + x * 77, 14 + y * 113, 72, 104);
    return new T.CanvasTexture(sheet);
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[0.73, 0.082, 1.02]} rotation={[-Math.PI / 2, 0, -0.32]}>
      <planeGeometry args={[2.45, 1.3]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={warm ? 0.19 : 0.038}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
