"use client";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";

export function SalonDetails({
  animate,
  interactive,
  target,
  dogScene,
  flowerScene,
}: {
  dogScene: T.Group;
  flowerScene: T.Group;
  animate: boolean;
  interactive: boolean;
  target: RefObject<HTMLButtonElement | null>;
}) {
  const leo = useMemo(() => dogScene.clone(true), [dogScene]);
  const flowers = useMemo(() => flowerScene.clone(true), [flowerScene]);
  const joints = useMemo(
    () => ({
      chest: leo.getObjectByName("Ribcage")!,
      head: leo.getObjectByName("SleepyHead")!,
      ear: leo.getObjectByName("LeftEar")!,
      tail: leo.getObjectByName("Plume")!,
      paw: leo.getObjectByName("NearPaw")!,
    }),
    [leo],
  );
  const { invalidate, size, gl } = useThree();
  const narrow = size.width / size.height < 0.87;
  useEffect(() => {
    // Stationary, filtered fibres give the coat a soft nap in the window light.
    const cloth = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      side: T.DoubleSide,
    });
    cloth.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 fibrePoint;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n fibrePoint=position;",
        );
      shader.fragmentShader =
        "varying vec3 fibrePoint;\n" +
        shader.fragmentShader
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
          float fur = smoothstep(.59,.82,diffuseColor.g);
          float comb = 550.*(fibrePoint.z*.67+fibrePoint.y*.83)+10.*sin(fibrePoint.x*21.+fibrePoint.z*7.);
          float fibres = sin(comb)*(.55+.45*sin(18.*fibrePoint.x+comb*.17));
          float yarn = sin(fibrePoint.x*900.)*cos(fibrePoint.z*800.);
          diffuseColor.rgb *= 1.+mix(.055*yarn,.082*fibres,fur)*(1.-smoothstep(.7,3.,fwidth(comb)));`,
          )
          .replace(
            "#include <opaque_fragment>",
            `float velvet = pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
          outgoingLight += diffuseColor.rgb*fur*(.10+.13*velvet);
          #include <opaque_fragment>`,
          );
    };
    leo.traverse((node) => {
      if (node instanceof T.Mesh) {
        node.material = cloth;
        node.castShadow = true;
      }
    });
    return () => cloth.dispose();
  }, [leo]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, narrow, invalidate]);
  const spot = useMemo(() => new T.Vector3(), []);
  const state = useRef({
    time: 0,
    nextEar: 6,
    earAt: -20,
    replyAt: -20,
    cooldownUntil: 0,
    hover: false,
    focus: false,
    touch: false,
  });
  const hideTask = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const group = useRef<T.Group>(null);
  function reveal() {
    if (!interactive || !target.current) return;
    target.current.dataset.revealed = "true";
    const now = performance.now();
    if (animate && now >= state.current.cooldownUntil) {
      state.current.replyAt = state.current.time;
      state.current.cooldownUntil = now + 4800;
    }
    invalidate();
  }
  function settle() {
    const s = state.current;
    if (target.current && !s.hover && !s.focus && !s.touch)
      delete target.current.dataset.revealed;
  }
  useEffect(() => {
    const button = target.current;
    if (!button) return;
    const focus = () => {
      state.current.focus = true;
      reveal();
    };
    const blur = () => {
      state.current.focus = false;
      settle();
    };
    const greet = () => {
      state.current.touch = true;
      reveal();
      clearTimeout(hideTask.current);
      hideTask.current = setTimeout(() => {
        state.current.touch = false;
        settle();
      }, 1900);
    };
    button.addEventListener("focus", focus);
    button.addEventListener("blur", blur);
    button.addEventListener("click", greet);
    return () => {
      clearTimeout(hideTask.current);
      button.removeEventListener("focus", focus);
      button.removeEventListener("blur", blur);
      button.removeEventListener("click", greet);
      state.current.focus = false;
      state.current.hover = false;
      state.current.touch = false;
      delete button.dataset.revealed;
    };
  }, [interactive, animate, target, invalidate]);
  useFrame(({ camera, size }, dt) => {
    const s = state.current;
    if (animate) s.time += Math.min(dt, 0.18);
    const t = s.time;
    if (t >= s.nextEar) {
      s.earAt = t;
      s.nextEar = t + 7 + Math.random() * 14;
    }
    const pulse = (since: number, duration: number) =>
      since >= 0 && since < duration
        ? Math.sin((Math.PI * since) / duration) ** 2
        : 0;
    const breath = animate
      ? 0.5 - 0.5 * Math.cos(t * 1.57 + 0.17 * Math.sin(t * 0.49))
      : 0;
    const response = animate ? pulse(t - s.replyAt, 1.85) : 0;
    joints.chest.scale.set(1, 1 + 0.027 * breath, 1 + 0.017 * breath);
    joints.head.rotation.x = -0.13 * response;
    joints.head.rotation.y = 0.45 + 0.095 * response;
    joints.ear.rotation.z = animate
      ? 0.13 * pulse(t - s.earAt, 0.48) + 0.19 * pulse(t - s.replyAt, 0.58)
      : 0;
    joints.paw.rotation.x = animate
      ? 0.045 * pulse(t - s.earAt - 0.8, 0.75)
      : 0;
    joints.tail.rotation.x = animate ? 0.037 * pulse(t - s.earAt - 2, 1.15) : 0;
    flowers.rotation.z = animate
      ? 0.009 * Math.sin(t * 0.68) + 0.004 * Math.sin(t * 1.1)
      : 0;
    const button = target.current;
    if (button && group.current) {
      spot.set(0.12, 0.38, 0.1);
      group.current.localToWorld(spot);
      spot.project(camera);
      const visible =
        interactive &&
        Math.abs(spot.x) < 0.97 &&
        Math.abs(spot.y) < 0.95 &&
        Math.abs(spot.z) < 1;
      button.hidden = !visible;
      if (visible)
        button.style.transform =
          "translate(" +
          (((spot.x + 1) * size.width) / 2).toFixed(1) +
          "px," +
          (((1 - spot.y) * size.height) / 2).toFixed(1) +
          "px) translate(-50%, -50%)";
    }
  });
  return (
    <>
      <primitive object={flowers} position={[2.6, 1.46, -1.96]} />
      <group
        ref={group}
        position={narrow ? [-0.28, 0.033, -0.08] : [-2.14, 0.033, 0.16]}
        scale={0.78}
        rotation={[0, 0.12, 0]}
      >
        <primitive object={leo} />
        {interactive && (
          <mesh
            position={[0, 0.31, 0.03]}
            scale={[0.52, 0.28, 0.34]}
            onPointerOver={() => {
              state.current.hover = true;
              reveal();
            }}
            onPointerOut={() => {
              state.current.hover = false;
              settle();
            }}
            onClick={() => target.current?.click()}
          >
            <sphereGeometry args={[1, 16, 10]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        )}
      </group>
    </>
  );
}
