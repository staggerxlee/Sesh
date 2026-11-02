"use client";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as T from "three";
import { Suspense, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { BookBindings } from "./book-bindings";
import { SalonSky, Sunbeams } from "./salon-light";
import { CoffeeSteam } from "./coffee-steam";
import { finishWood, WindowLight } from "./room-materials";
import { pianistState, type PianistState } from "@/lib/pianist";
import type { Sound } from "@/lib/cinema-audio";
export type CameraMode = "home" | "enter" | "focus" | "complete" | "retreat";
export interface WorldProps {
  parked: boolean;
  mode: CameraMode;
  onSettled: (mode: CameraMode) => void;
  sound: Sound;
  playing: boolean;
  moving: boolean;
  effects: boolean;
  playhead: () => number;
  onReady: () => void;
  onSlow: () => void;
  onPerformer: (s: PianistState) => void;
}
function Drapes({ moving }: { moving: boolean }) {
  const curtain = useRef<T.Group>(null);
  const geo = useMemo(() => {
    const g = new T.PlaneGeometry(0.31, 1.91, 16, 18),
      v = g.attributes.position;
    for (let n = 0; n < v.count; n++) {
      const x = v.getX(n),
        y = v.getY(n);
      v.setXYZ(
        n,
        x * (0.8 + 0.13 * Math.cos(y * 4)),
        y,
        0.048 * Math.cos(x * 97) + 0.012 * Math.sin(y * 3),
      );
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (curtain.current)
      curtain.current.rotation.z = moving
        ? 0.012 * Math.sin(clock.elapsedTime * 0.61)
        : 0;
  });
  return (
    <group ref={curtain} position={[2.21, 2.13, -1.9]}>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color="#e8d7bb"
          transparent
          opacity={0.82}
          side={T.DoubleSide}
          roughness={1}
        />
      </mesh>
    </group>
  );
}
function Rain({ on, moving }: { on: boolean; moving: boolean }) {
  const geom = useMemo(() => {
    const g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(66 * 6), 3),
    );
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!on) return;
    const v = geom.attributes.position;
    for (let j = 0; j < 66; j++) {
      const x = -2.71 + ((j * 0.618) % 1) * 5.4,
        y =
          1.02 +
          2.18 *
            (1 -
              ((j * 0.414 +
                (moving ? clock.elapsedTime * (0.23 + (j % 4) * 0.05) : 0)) %
                1));
      v.setXYZ(j * 2, x, y, -2.33);
      v.setXYZ(j * 2 + 1, x + 0.009, y + 0.052, -2.33);
    }
    v.needsUpdate = true;
  });
  return (
    <lineSegments visible={on} frustumCulled={false} geometry={geom}>
      <lineBasicMaterial color="#d6e4f7" transparent opacity={0.59} />
    </lineSegments>
  );
}
function Model({ p }: { p: WorldProps }) {
  const room = useLoader(GLTFLoader, "/atelier/room.glb"),
    actor = useLoader(GLTFLoader, "/atelier/pianist.glb");
  const scene = useMemo(() => clone(actor.scene), [actor]),
    mixer = useMemo(() => new T.AnimationMixer(scene), [scene]);
  const progress = useRef(0),
    state = useRef<PianistState>("Idle"),
    group = useRef<T.Group>(null),
    light = useRef<T.DirectionalLight>(null),
    pianoLight = useRef<T.PointLight>(null),
    lastAction = useRef<T.AnimationAction | null>(null),
    frame = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    poor = useRef(0),
    degraded = useRef(false),
    first = useRef(true),
    aim = useRef(new T.Vector3(0, 1.32, 0));
  const { camera, size, invalidate, gl } = useThree();
  const inView = useRef(true);
  useEffect(() => {
    const canvas = gl.domElement;
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      if (entry.isIntersecting) invalidate();
    });
    observer.observe(canvas);
    canvas.addEventListener("webglcontextlost", p.onSlow);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", p.onSlow);
    };
  }, [gl, invalidate, p.onSlow]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [invalidate]);
  const interior = p.mode === "enter" || p.mode === "focus";
  const isPiano = p.sound === "piano" && interior;
  const framing = useRef({ shift: 0 });
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    room.scene.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        if (obj.material instanceof T.MeshStandardMaterial)
          finishWood(obj.material);
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    p.onReady();
    return () => {
      clearTimeout(frame.current);
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [room, scene, mixer, p.onReady]);
  useEffect(() => {
    const c = camera as T.PerspectiveCamera,
      portrait = size.width / size.height < 0.87;
    const threshold = p.mode === "home" || p.mode === "retreat";
    const wide = threshold || p.mode === "complete";
    // All poses share the open front of the miniature. Dolly along the aisle,
    // leaving breathing room above the piano for the session's typography.
    const dest = wide
      ? [-0.15, 1.47, 3.74]
      : isPiano
        ? [1.34, 1.39, 2.46]
        : [0.92, 1.49, 2.88];
    const target = wide
      ? [0.46, 1.46, -1.4]
      : isPiano
        ? [-0.77, 1.47, -0.7]
        : [-0.14, 1.46, -1.05];
    const fov = portrait ? (wide ? 69 : 65) : wide ? 51 : 53;
    const coldOpen = first.current;
    if (coldOpen) {
      c.position.set(-0.15, 1.47, 3.74);
      aim.current.set(0.46, 1.46, -1.4);
      c.fov = portrait ? 69 : 51;
      first.current = false;
    }
    const paint = () => {
      c.setViewOffset(
        size.width,
        size.height,
        -size.width * framing.current.shift,
        0,
        size.width,
        size.height,
      );
      c.lookAt(aim.current);
      c.updateProjectionMatrix();
      invalidate();
    };
    const tl = gsap.timeline({
      defaults: {
        duration: p.moving && !(coldOpen && threshold) ? 1.75 : 0,
        ease: "power2.inOut",
      },
      onUpdate: paint,
      onComplete: () => p.onSettled(p.mode),
    });
    tl.to(c.position, { x: dest[0], y: dest[1], z: dest[2] }, 0)
      .to(aim.current, { x: target[0], y: target[1], z: target[2] }, 0)
      .to(c, { fov }, 0)
      .to(
        framing.current,
        {
          shift: portrait ? (wide ? 0.02 : 0) : wide ? 0.1 : 0.04,
        },
        0,
      );
    paint();
    return () => {
      tl.kill();
    };
  }, [camera, p.mode, isPiano, p.moving, size.width, size.height, invalidate]);
  useEffect(() => {
    invalidate();
  }, [p.parked, p.sound, p.playing, p.effects, p.moving, p.mode, invalidate]);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1),
      dest = isPiano ? 1 : 0;
    progress.current = p.moving
      ? T.MathUtils.clamp(
          progress.current +
            (Math.sign(dest - progress.current) * dt) / (dest ? 2.85 : 2.35),
          0,
          1,
        )
      : dest;
    const v = progress.current,
      s = pianistState(v, isPiano, p.playing),
      walk = T.MathUtils.smoothstep(v, 0.03, 0.69),
      sit = T.MathUtils.smoothstep(v, 0.69, 1);
    if (group.current) {
      group.current.visible = v > 0.001;
      group.current.position.set(
        -1.04 + (1 - walk) * 1.56,
        -0.07 * sit,
        0.23 - 0.035 * sit + (1 - walk) * 3.1,
      );
      group.current.rotation.y = T.MathUtils.damp(
        group.current.rotation.y,
        (isPiano ? 0.45 : 2.82) * (1 - sit),
        7,
        dt,
      );
    }
    if (state.current !== s) {
      state.current = s;
      p.onPerformer(s);
    }
    const which =
      s === "Playing" && p.moving
        ? "Perform"
        : s === "Sitting"
          ? "Sit"
          : s === "Standing"
            ? "Stand"
            : s === "Paused" || s === "Playing"
              ? "Seated"
              : s === "Walking" || s === "Exiting"
                ? "Walk"
                : "Idle";
    const clip = actor.animations.find((a) => a.name === which);
    if (!clip) {
      p.onSlow();
      return;
    }
    const a = mixer.clipAction(clip);
    if (lastAction.current !== a) {
      lastAction.current?.fadeOut(p.moving ? 0.32 : 0);
      a.reset()
        .fadeIn(p.moving ? 0.32 : 0)
        .play();
      lastAction.current = a;
    }
    if (which === "Sit" || which === "Stand") {
      a.paused = true;
      a.time = which === "Sit" ? sit : 1 - sit;
    } else a.paused = !p.moving;
    if (which === "Perform") {
      a.paused = true;
      a.time = p.playhead() % clip.duration;
    }
    if (v > 0) mixer.update(dt);
    const rain = interior && p.effects && p.sound === "rain",
      lofi = interior && p.effects && p.sound === "lofi";
    if (light.current) {
      light.current.color.lerp(
        new T.Color(
          rain
            ? "#a5b8d3"
            : lofi
              ? "#ecad7e"
              : p.effects && p.sound === "nature"
                ? "#ffd49a"
                : "#ffc48b",
        ),
        Math.min(1, dt * 3),
      );
      light.current.intensity = T.MathUtils.damp(
        light.current.intensity,
        rain ? 0.72 : lofi ? 0.9 : 2.7,
        3,
        dt,
      );
    }
    if (pianoLight.current)
      pianoLight.current.intensity = T.MathUtils.damp(
        pianoLight.current.intensity,
        isPiano ? 2.5 : 0.75,
        3,
        dt,
      );
    if (!document.hidden && p.playing && delta > 0.32 && delta < 2)
      poor.current += dt;
    else poor.current = Math.max(0, poor.current - 0.05);
    if (poor.current > 2) {
      if (!degraded.current) {
        gl.shadowMap.enabled = false;
        gl.setPixelRatio(0.85);
        degraded.current = true;
        poor.current = 0;
      } else p.onSlow();
    }
    clearTimeout(frame.current);
    if (
      !document.hidden &&
      !p.parked &&
      inView.current &&
      ((p.moving && (p.effects || v !== dest || (isPiano && p.playing))) ||
        (pianoLight.current &&
          Math.abs(pianoLight.current.intensity - (isPiano ? 2.5 : 0.75)) >
            0.025) ||
        (light.current &&
          Math.abs(light.current.intensity - (rain ? 0.72 : lofi ? 0.9 : 2.7)) >
            0.025))
    )
      frame.current = setTimeout(
        invalidate,
        v !== dest || s === "Playing" ? 24 : 115,
      );
  });
  return (
    <>
      <color attach="background" args={["#17181a"]} />
      <SalonSky sound={interior && p.effects ? p.sound : "nature"} />
      <Sunbeams
        on={
          p.effects && (!interior || (p.sound !== "rain" && p.sound !== "lofi"))
        }
      />
      <fog attach="fog" args={["#8f7765", 8, 25]} />
      <hemisphereLight args={["#d6d1cd", "#745b47", 0.72]} />
      <directionalLight
        ref={light}
        position={[3.8, 3.58, -5.2]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.018}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <pointLight
        position={[2.43, 1.72, -0.4]}
        color="#ffc28e"
        intensity={5.0}
        distance={4}
      />
      <pointLight
        ref={pianoLight}
        position={[-1.25, 2.05, -1.42]}
        color="#ffcc89"
        distance={3.6}
      />
      <primitive object={room.scene} />
      <BookBindings />
      <WindowLight
        warm={!interior || (p.sound !== "rain" && p.sound !== "lofi")}
      />
      <mesh position={[0, 3.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.1, 4.8]} />
        <meshStandardMaterial color="#594438" roughness={1} />
      </mesh>
      {p.effects && p.moving && <CoffeeSteam sound={p.sound} />}
      <Drapes moving={p.moving && p.effects} />
      <Rain
        on={interior && p.effects && p.sound === "rain"}
        moving={p.moving}
      />
      <group ref={group} visible={false}>
        <primitive object={scene} />
      </group>
    </>
  );
}
export default function AtelierWorld(p: WorldProps) {
  return (
    <Canvas
      camera={{ position: [6.2, 5.2, 7.9], near: 0.035, far: 50, fov: 45 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      shadows={{ type: T.PCFShadowMap }}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
    >
      <Suspense fallback={null}>
        <Model p={p} />
      </Suspense>
    </Canvas>
  );
}
