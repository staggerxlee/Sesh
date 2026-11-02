import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AnimationMixer, SkinnedMesh, Mesh, Vector3 } from "three";
async function load(name: string) {
  const b = await readFile(
    new URL("../public/atelier/" + name, import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    "",
  );
}
test("the room loads as one batched mesh, without external textures", async () => {
  const model = await load("room.glb");
  const meshes: Mesh[] = [];
  model.scene.traverse((n) => {
    if (n instanceof Mesh) meshes.push(n);
  });
  assert.equal(meshes.length, 1);
  assert.ok(meshes[0].geometry.attributes.position.count > 3000);
});
test("the performance clip moves an elbow on the bound pianist skeleton", async () => {
  const actor = await load("pianist.glb");
  assert.deepEqual(
    actor.animations.map((a) => a.name),
    ["Walk", "Seated", "Perform", "Sit", "Stand", "Idle"],
  );
  const skin = actor.scene.getObjectByName("Pianist") as SkinnedMesh;
  assert.ok(skin.isSkinnedMesh);
  const elbow = skin.skeleton.getBoneByName("ForeL")!;
  const mixer = new AnimationMixer(actor.scene);
  mixer.clipAction(actor.animations[2]).play();
  mixer.setTime(0.01);
  const pose = elbow.quaternion.clone();
  mixer.setTime(0.48);
  assert.ok(pose.angleTo(elbow.quaternion) > 0.15);
  assert.ok(skin.skeleton.getBoneByName("FingerL0"));
});
import { pianistState } from "../src/lib/pianist";
test("pianist reaches the keys before playback and reverses cleanly on disable", () => {
  assert.deepEqual(
    [0, 0.04, 0.5, 0.84, 1].map((v) => pianistState(v, true, true)),
    ["Idle", "Entering", "Walking", "Sitting", "Playing"],
  );
  assert.equal(pianistState(1, true, false), "Paused");
  assert.equal(pianistState(0.82, false, false), "Standing");
  assert.equal(pianistState(0.44, false, false), "Exiting");
  assert.equal(pianistState(0, false, false), "Idle");
});

test("the indexed pianist breathes at rest and reaches the white keys on both hands", async () => {
  const actor = await load("pianist.glb");
  const skin = actor.scene.getObjectByName("Pianist") as SkinnedMesh;
  assert.ok(skin.geometry.index && skin.geometry.index.count / 3 < 24000);
  let meshes = 0;
  actor.scene.traverse((n) => {
    if (n instanceof Mesh) meshes++;
  });
  assert.equal(meshes, 1);
  const mixer = new AnimationMixer(actor.scene);
  mixer.clipAction(actor.animations.find((a) => a.name === "Seated")!).play();
  mixer.setTime(0);
  const spine = skin.skeleton.getBoneByName("Spine")!,
    rest = spine.quaternion.clone();
  mixer.setTime(1.2);
  assert.ok(rest.angleTo(spine.quaternion) > 0.015);
  mixer.stopAllAction();
  mixer.clipAction(actor.animations.find((a) => a.name === "Perform")!).play();
  for (let note = 0; note < 32; note++) {
    mixer.setTime((note + 0.25) * 0.43);
    const side = note % 2 ? "R" : "L",
      finger = skin.skeleton.getBoneByName("Finger" + side + (note % 4))!;
    const tip = finger.localToWorld(new Vector3(0, -0.055, 0));
    // Final group translation and white-key dimensions from the modeled salon.
    assert.ok(
      Math.abs(tip.y - 0.07 - 1.07) < 0.008,
      "vertical contact on note " + note,
    );
    assert.ok(
      tip.z + 0.195 < -0.2 && tip.z + 0.195 > -0.59,
      "finger above the keyboard",
    );
  }
});
