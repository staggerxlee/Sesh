"use client";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as T from "three";
import type { Sound } from "@/lib/cinema-audio";

import { daySegment, dayKeys, type RoomDay } from "@/lib/room-day";
const grades: Record<Sound, string> = {
  piano: "#ffdbad",
  nature: "#ffe3c4",
  silence: "#f6d7c1",
  rain: "#91adc7",
  lofi: "#bb8a95",
  ocean: "#c4dce3",
  brown: "#dac4a8",
  hertz: "#e3d5c7",
  custom: "#e3d5c7",
};
export function SalonSky({
  sound,
  day,
  moving = true,
}: {
  sound: Sound;
  day?: RoomDay;
  moving?: boolean;
}) {
  const colors = useMemo(
    () => new Map(dayKeys.map((k) => [k.color, new T.Color(k.color)])),
    [],
  );
  const dayTint = useMemo(() => new T.Color(), []);
  const texture = useLoader(T.TextureLoader, "/atelier/alpenglow.webp");
  texture.colorSpace = T.SRGBColorSpace;
  const uniforms = useMemo(
    () => ({
      scenery: { value: texture },
      tint: { value: new T.Color(grades.nature) },
      overcast: { value: 0 },
      night: { value: 0 },
      drift: { value: 0 },
      phase: { value: 0 },
      personal: { value: day ? 1 : 0 },
    }),
    [texture],
  );
  const tint = useMemo(() => new T.Color(grades[sound]), [sound]);
  const { scene, gl } = useThree();
  useEffect(() => {
    // A soft reflection of the real window gives the black piano a readable rim.
    const card = document.createElement("canvas");
    card.width = 256;
    card.height = 128;
    const ctx = card.getContext("2d")!;
    ctx.fillStyle = "#332b24";
    ctx.fillRect(0, 0, 256, 128);
    const wash = ctx.createLinearGradient(0, 39, 0, 81);
    wash.addColorStop(0, "#8f9aaa");
    wash.addColorStop(0.62, "#f7c493");
    wash.addColorStop(1, "#483b32");
    ctx.fillStyle = wash;
    ctx.fillRect(89, 39, 62, 42);
    ctx.fillStyle = "#553d30";
    for (const x of [105, 127]) ctx.fillRect(x, 39, 2, 42);
    const map = new T.CanvasTexture(card);
    map.colorSpace = T.SRGBColorSpace;
    map.mapping = T.EquirectangularReflectionMapping;
    const generator = new T.PMREMGenerator(gl);
    const env = generator.fromEquirectangular(map);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.42;
    return () => {
      scene.environment = null;
      env.dispose();
      generator.dispose();
      map.dispose();
    };
  }, [gl, scene]);
  useFrame((_, dt) => {
    const blend = 1 - Math.exp(-4 * Math.min(0.15, dt));
    let night = sound === "lofi" ? 1 : 0;
    if (day) {
      const { a, b, t, phase } = daySegment(day.read());
      dayTint.copy(colors.get(a.color)!).lerp(colors.get(b.color)!, t);
      night = T.MathUtils.lerp(a.night, b.night, t);
      uniforms.phase.value = phase / 3600;
      if (moving) uniforms.drift.value = performance.now() / 1000000;
    }
    uniforms.personal.value = day ? 1 : 0;
    uniforms.tint.value.lerp(day ? dayTint : tint, blend);
    scene.environmentIntensity = day ? 0.25 + 0.25 * (1 - night) : 0.42;
    uniforms.overcast.value = T.MathUtils.lerp(
      uniforms.overcast.value,
      sound === "rain" ? 1 : 0,
      blend,
    );
    uniforms.night.value = T.MathUtils.lerp(uniforms.night.value, night, blend);
  });
  return (
    <mesh position={[0.6, 0.39, -7.8]}>
      <planeGeometry args={[17.4, 11.6]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`varying vec2 viewUv;void main(){viewUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`uniform sampler2D scenery;uniform vec3 tint;uniform float overcast;uniform float night;uniform float drift;uniform float phase;uniform float personal;varying vec2 viewUv;
      void main(){
        vec3 landscape=texture2D(scenery,viewUv).rgb;
        float value=dot(landscape,vec3(.26,.63,.11));
        vec3 clear=landscape*tint;
        vec3 wet=mix(vec3(value)*vec3(.52,.67,.83), vec3(.18,.22,.28), .27);
        vec3 dusk=vec3(value*.17,value*.21,value*.39)+landscape*.09;
        vec3 result=mix(mix(clear,wet,overcast),dusk,night);
        float sky=smoothstep(.73,.88,viewUv.y)*personal;
        float cloud=pow(.5+.5*sin(viewUv.x*13.+drift)*sin(viewUv.y*47.+sin(viewUv.x*8.-drift*.6)),5.);
        result=mix(result, mix(tint*.35,vec3(.1,.14,.24),night),sky*.48);
        result+=sky*cloud*.06*(1.-night*.7)*(1.-overcast*.5);
        vec2 moon=vec2(.72+.055*cos(phase*6.28318),.86+.035*sin(phase*6.28318));
        float disc=1.-smoothstep(.009,.012,length((viewUv-moon)*vec2(1.5,1.)));
        vec2 cell=floor(viewUv*vec2(83.,53.));
        float star=step(.985,fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453));
        star*=1.-smoothstep(.025,.09,length(fract(viewUv*vec2(83.,53.))-.5));
        result+=(disc*.55+star*.28)*sky*night*(1.-overcast);
        gl_FragColor=vec4(result,1.);
        #include <colorspace_fragment>
      }`}
      />
    </mesh>
  );
}
// A feathered shaft catches haze between the window and the study floor.
export function Sunbeams({ on }: { on: boolean }) {
  return (
    <group visible={on}>
      {[0, 1].map((i) => (
        <mesh
          key={i}
          position={[0.92 + i * 0.78, 1.73, -0.73]}
          rotation={[-0.42, 0, -0.59]}
          renderOrder={1}
        >
          <planeGeometry args={[0.59 + i * 0.15, 4.4]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            side={T.DoubleSide}
            blending={T.AdditiveBlending}
            vertexShader={`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
            fragmentShader={`varying vec2 v;void main(){float s=pow(sin(v.x*3.14159),1.35)*sin(v.y*3.14159);gl_FragColor=vec4(.98,.67,.38,.062*s);}`}
          />
        </mesh>
      ))}
    </group>
  );
}
