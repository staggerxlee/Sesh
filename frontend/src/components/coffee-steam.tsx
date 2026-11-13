"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as T from "three";
import type { Sound } from "@/lib/cinema-audio";

// Three advecting ribbons share one soft, camera-facing plume.
export function CoffeeSteam({ sound }: { sound: Sound }) {
  const root = useRef<T.Mesh<T.PlaneGeometry, T.ShaderMaterial>>(null);
  const uniforms = useMemo(
    () => ({ phase: { value: 0 }, tint: { value: new T.Color("#f6d4ae") } }),
    [],
  );
  const target = useMemo(
    () =>
      new T.Color(
        sound === "rain" ? "#ccddec" : sound === "lofi" ? "#ffc597" : "#f6e4c9",
      ),
    [sound],
  );
  useFrame(({ camera, clock }, dt) => {
    if (!root.current) return;
    root.current.quaternion.copy(camera.quaternion);
    const live = root.current.material.uniforms;
    live.phase.value = clock.elapsedTime;
    live.tint.value.lerp(target, Math.min(dt * 2, 1));
  });
  return (
    <mesh ref={root} position={[1.3, 1.496, 0.2]} renderOrder={3}>
      <planeGeometry args={[0.25, 0.46]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec2 v;uniform float phase;uniform vec3 tint;
      float wisp(float seed, float speed) {
        float h = v.y;
        float flow = h * 9.5 - phase * speed + seed;
        float curl = sin(flow + .55 * sin(flow * .64 + seed));
        float drift = sin(phase * .49 + seed + h * 2.5);
        float axis = .5 + .045*sin(seed) + h*(.09 + .17*drift) + (.018+.19*h)*curl;
        float width = .019 + .065*h + .027*h*(1.+cos(flow));
        float d = (v.x-axis)/width;
        float density = .64 + .36*sin(flow*1.26 + .5*sin(phase*.63+seed));
        return exp(-d*d)*density*smoothstep(0.,.085,h)*(1.-smoothstep(.28,.99,h));
      }
      void main(){gl_FragColor=vec4(tint,.29*wisp(0.,2.4)+.20*wisp(2.1,2.9)+.16*wisp(4.6,2.05));
      #include <colorspace_fragment>
      }`}
      />
    </mesh>
  );
}
