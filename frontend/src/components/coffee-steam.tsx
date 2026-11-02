"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as T from "three";
import type { Sound } from "@/lib/cinema-audio";

// Both wisps share a single camera-facing quad. No per-frame buffers or emitters.
export function CoffeeSteam({ sound }: { sound: Sound }) {
  const root = useRef<T.Mesh>(null);
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
    if (root.current) root.current.quaternion.copy(camera.quaternion);
    uniforms.phase.value = clock.elapsedTime;
    uniforms.tint.value.lerp(target, Math.min(dt * 2, 1));
  });
  return (
    <mesh ref={root} position={[1.3, 1.445, 0.2]} renderOrder={3}>
      <planeGeometry args={[0.17, 0.36]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec2 v;uniform float phase;uniform vec3 tint;
      float plume(float offset){float h=v.y;float k=h*8.-phase*.77+offset;
        float x=.5+.17*h+.18*sin(k)*(.2+h)+.09*sin(2.3*k+offset)*h;
        float w=.037+.08*h;float d=(v.x-x)/w;
        return exp(-d*d)*smoothstep(.0,.12,h)*(1.-smoothstep(.35,1.,h))*(.65+.35*sin(k*.8));}
      void main(){gl_FragColor=vec4(tint,.26*plume(.0)+.11*plume(2.7));
      #include <colorspace_fragment>
      }`}
      />
    </mesh>
  );
}
