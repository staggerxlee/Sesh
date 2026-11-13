"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSesh } from "@/lib/store";

type Note = { text: string; cover: string; revision: number };
const blank: Note = { text: "", cover: "", revision: 0 };
export function CalendarNote({
  kind,
  date,
  label,
  placeholder,
  coverChoice = false,
  onCover,
}: {
  kind: "daily" | "monthly" | "motto";
  date: string;
  label: string;
  placeholder: string;
  coverChoice?: boolean;
  onCover?: (value: string) => void;
}) {
  const { user, openAuth } = useSesh();
  const key = `sesh-note-draft:${user?.id}:${kind}:${date}`;
  const [note, setNote] = useState<Note>(blank);
  const [saved, setSaved] = useState<Note>(blank);
  const [conflict, setConflict] = useState<Note | null>(null);
  const [status, setStatus] = useState("Loading note…");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const latestCover = useRef(onCover);
  latestCover.current = onCover;
  const live = useRef(true);
  const dirty = note.text !== saved.text || note.cover !== saved.cover;
  useEffect(() => {
    live.current = true;
    let current = true;
    setLoaded(false);
    if (!user) {
      setStatus("");
      return;
    }
    api<Note>(`/calendar/notes/?kind=${kind}&date=${date}`)
      .then((value) => {
        if (!current) return;
        let draft: Note | null = null;
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const recovered = JSON.parse(raw);
            if (
              typeof recovered.text === "string" &&
              typeof recovered.cover === "string" &&
              Number.isInteger(recovered.revision)
            )
              draft = recovered;
          }
        } catch {
          /* Draft recovery is optional when storage is unavailable. */
        }
        setSaved(value);
        setNote(draft || value);
        setLoaded(true);
        if (
          draft &&
          draft.revision !== value.revision &&
          (draft.text !== value.text || draft.cover !== value.cover)
        ) {
          setConflict(value);
          setStatus(
            "A newer version was saved on another device. Your draft is kept below.",
          );
        } else {
          setConflict(null);
          setStatus(draft ? "Unsaved draft recovered" : "");
        }
        latestCover.current?.((draft || value).cover);
      })
      .catch((error) => {
        if (current) setStatus(error.message);
      });
    return () => {
      current = false;
      live.current = false;
    };
  }, [key, user?.id, kind, date, retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !dirty && !saving)
        setRetry((value) => value + 1);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [dirty, saving]);
  function edit(next: Note) {
    setNote(next);
    setStatus("Draft kept on this device · save to sync");
    latestCover.current?.(next.cover);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setStatus("Unsaved · keep this page open until saved");
    }
  }
  async function save() {
    if (saving || conflict || !loaded) return;
    setSaving(true);
    setStatus("Saving…");
    try {
      const value = await api<Note>("/calendar/notes/", {
        method: "PATCH",
        body: JSON.stringify({ kind, date, ...note }),
      });
      try {
        // A save can finish after the user revisits this date and writes a new draft.
        // Only remove the exact draft that this request saved.
        if (localStorage.getItem(key) === JSON.stringify(note))
          localStorage.removeItem(key);
      } catch {
        /* Server save remains authoritative. */
      }
      if (live.current) {
        setNote(value);
        setSaved(value);
        setStatus(value.text ? "Saved" : "Note cleared");
      }
    } catch (error) {
      if (live.current) {
        if (error instanceof ApiError && error.status === 409)
          setConflict((error.data as { current: Note }).current);
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not save. Your draft is kept.",
        );
      }
    } finally {
      if (live.current) setSaving(false);
    }
  }
  if (!user)
    return (
      <button className="calendar-text-link" onClick={openAuth}>
        Sign in to keep your reflections
      </button>
    );
  return (
    <div className="calendar-note">
      <label>
        {label}
        <textarea
          value={note.text}
          disabled={!loaded || saving}
          maxLength={kind === "motto" ? 240 : 5000}
          rows={kind === "motto" ? 2 : 4}
          placeholder={placeholder}
          onChange={(event) => edit({ ...note, text: event.target.value })}
        />
      </label>
      {coverChoice && (
        <label className="calendar-cover-choice">
          Botanical cover
          <select
            aria-label="Botanical cover"
            disabled={!loaded || saving}
            value={note.cover}
            onChange={(event) => edit({ ...note, cover: event.target.value })}
          >
            <option value="">Month’s botanical</option>
            <option value="lily">Pink lily · editorial variation</option>
          </select>
        </label>
      )}
      {conflict && (
        <div className="calendar-conflict">
          <p>Saved on your other device</p>
          <blockquote>{conflict.text || "Empty note"}</blockquote>
          <button
            onClick={() => {
              setSaved(conflict);
              edit({ ...note, revision: conflict.revision });
              setConflict(null);
            }}
          >
            Keep my draft for review
          </button>
          <button
            onClick={() => {
              setNote(conflict);
              setSaved(conflict);
              latestCover.current?.(conflict.cover);
              setConflict(null);
              setStatus("Loaded saved version");
              try {
                localStorage.removeItem(key);
              } catch {}
            }}
          >
            Use saved version
          </button>
        </div>
      )}
      <div className="calendar-note-actions">
        <span role="status">{status}</span>
        {!loaded ? (
          <button onClick={() => setRetry((value) => value + 1)}>Retry</button>
        ) : (
          <>
            <button
              disabled={saving || !note.text}
              onClick={() => edit({ ...note, text: "" })}
            >
              Clear
            </button>
            <button disabled={saving || !dirty || !!conflict} onClick={save}>
              {saving ? "Saving…" : "Save note"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
