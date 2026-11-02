import type { Sound } from "./cinema-audio";

export const salonEditions: { sound: Sound; title: string; detail: string }[] =
  [
    { sound: "piano", title: "The recital", detail: "Piano étude" },
    { sound: "rain", title: "Rain at the glass", detail: "Rainfall" },
    { sound: "lofi", title: "After hours", detail: "Lo-fi" },
    { sound: "nature", title: "The golden hour", detail: "Nature" },
    { sound: "silence", title: "Still room", detail: "Silence" },
  ];
export function enterSalon(sound: Sound = "nature") {
  window.dispatchEvent(
    new CustomEvent("sesh-enter-room", { detail: { sound } }),
  );
}
