"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Pencil } from "lucide-react";
import { PageLink } from "@/lib/navigation-motion";
import { enterSalon } from "@/lib/salon";
import { duration } from "@/lib/utils";
import { api } from "@/lib/api";
import { broadcast, useSesh } from "@/lib/store";
import type { PersonalCover } from "@/lib/types";

const empty: PersonalCover = {
  words: "",
  show_on_entry: false,
  focal_x: 50,
  focal_y: 50,
  image_revision: null,
};
export function PersonalHero({
  resume,
  onAuthIntent,
}: {
  resume: boolean;
  onAuthIntent: (value: boolean) => void;
}) {
  const { user, preferences, openAuth, applyCover, notify, stats } = useSesh();
  const saved = user?.cover ?? empty;
  const [editing, edit] = useState(resume),
    [draft, setDraft] = useState(saved),
    [file, setFile] = useState<File | null>(null),
    [remove, setRemove] = useState(false),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      document
        .querySelector("#personal-editor")
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [editing]);
  const cover = editing ? draft : saved,
    words = cover.words.trim() ? cover.words : "";
  const own = cover.image_revision && !remove;
  const image =
    file && preview
      ? preview
      : own
        ? "/api/v1/profile/cover/image/wide/?v=" + cover.image_revision
        : "";
  function close() {
    onAuthIntent(false);
    edit(false);
    setFile(null);
    setRemove(false);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function save() {
    if (!user || busy) return;
    setError("");
    setBusy(true);
    const form = new FormData();
    for (const key of ["words", "show_on_entry", "focal_x", "focal_y"] as const)
      form.set(key, String(draft[key]));
    if (file) form.set("image", file);
    else if (remove) form.set("remove_image", "true");
    try {
      const cover = await api<PersonalCover>("/profile/cover/", {
        method: "PATCH",
        body: form,
      });
      applyCover(user.id, cover);
      broadcast();
      close();
      notify("Personal cover saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="personal-space">
      <header
        className={"sheet-mast personal-mast" + (image ? " with-photo" : "")}
      >
        {image && (
          <picture key={image} className="personal-photo">
            {!file && (
              <source
                media="(max-width: 640px)"
                srcSet={
                  "/api/v1/profile/cover/image/small/?v=" + cover.image_revision
                }
              />
            )}
            <img
              src={image}
              alt=""
              style={{
                objectPosition: cover.focal_x + "% " + cover.focal_y + "%",
              }}
            />
          </picture>
        )}
        <div className="mast-copy">
          <div className="index-label">
            <span className="signal" /> SESH &nbsp; / &nbsp; THE LISTENING ROOM
          </div>
          <h1
            className={
              words
                ? words.length > 85 || words.split("\n").length > 3
                  ? "long-words"
                  : "own-words"
                : ""
            }
          >
            {words || (
              <>
                <span>A Calmer</span> <em>You.</em>
              </>
            )}
          </h1>
          <p className="hero-intro">A private space for study and sound.</p>
          <button className="begin-salon" onClick={() => enterSalon()}>
            Begin Focus <ArrowRight size={17} />
          </button>
          <button
            ref={trigger}
            className="personal-invite"
            aria-expanded={editing}
            aria-controls="personal-editor"
            onClick={() => {
              if (editing) {
                if (!busy) close();
              } else {
                setDraft(saved);
                edit(true);
              }
            }}
          >
            {words || saved.image_revision ? (
              <>
                <Pencil size={12} /> Edit your cover
              </>
            ) : (
              <>
                What keeps you going? Make this space yours.{" "}
                <ArrowUpRight size={14} />
              </>
            )}
          </button>
        </div>
        <div className="mast-date">
          <span>LOCAL EDITION</span>
          <b>
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: preferences.timezone,
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date())}
          </b>
        </div>
        <div className="hero-week">
          <small>WEEKLY INTENTION</small>
          <strong>
            {duration(stats?.week_seconds || 0)} <i>/</i>{" "}
            {duration(preferences.weekly_goal_minutes * 60)}
          </strong>
          <div className="weekly-pips" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <i
                key={i}
                className={
                  i < ((stats?.week_goal_percent || 0) * 7) / 100 ? "lit" : ""
                }
              />
            ))}
          </div>
        </div>
        <div className="hero-colophon">
          <span>FIG. 01 &nbsp; THE WINDOW SALON</span>
          <PageLink href="/study-index">
            Study index <ArrowDown size={13} />
          </PageLink>
        </div>
      </header>
      {editing && (
        <form
          id="personal-editor"
          className="personal-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {user ? (
            <fieldset disabled={busy}>
              <div className="personal-fields">
                <div>
                  <label htmlFor="personal-words">What keeps you going?</label>
                  <textarea
                    id="personal-words"
                    ref={input}
                    maxLength={240}
                    rows={3}
                    placeholder="In your own words…"
                    value={draft.words}
                    onChange={(e) =>
                      setDraft({ ...draft, words: e.target.value })
                    }
                  />
                  <div className="personal-meta">
                    <span>Only visible to you</span>
                    <span>{draft.words.length} / 240</span>
                  </div>
                  <label className="entry-switch">
                    <input
                      type="checkbox"
                      checked={draft.show_on_entry}
                      onChange={(e) =>
                        setDraft({ ...draft, show_on_entry: e.target.checked })
                      }
                    />{" "}
                    Show my words briefly on room entry
                  </label>
                </div>
                <div className="personal-image-tools">
                  <label htmlFor="cover-file">
                    Cover photograph <small>/ OPTIONAL</small>
                  </label>
                  <label className="file-choice">
                    {image ? "Replace photograph" : "Choose a photograph"} ↗
                    <input
                      id="cover-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        if (
                          f.size > 6 * 1024 * 1024 ||
                          !["image/jpeg", "image/png", "image/webp"].includes(
                            f.type,
                          )
                        ) {
                          setError("Choose a JPEG, PNG or WebP under 6 MB.");
                          return;
                        }
                        setError("");
                        setFile(f);
                        setRemove(false);
                        setDraft({ ...draft, focal_x: 50, focal_y: 50 });
                      }}
                    />
                  </label>
                  <small>JPEG, PNG or WebP · Up to 6 MB</small>
                  {image && (
                    <div className="focal-tools">
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis}>
                          {axis === "x" ? "Horizontal crop" : "Vertical crop"}
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={draft[axis === "x" ? "focal_x" : "focal_y"]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [axis === "x" ? "focal_x" : "focal_y"]:
                                  +e.target.value,
                              })
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setRemove(true);
                        }}
                      >
                        Remove photograph
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {error && <p role="alert">{error}</p>}
              <div className="personal-actions">
                <button type="submit">{busy ? "Saving…" : "Save cover"}</button>
                <button type="button" onClick={close}>
                  Cancel
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="guest-note">
              <p>Your words and photograph belong to your private account.</p>
              <button
                type="button"
                onClick={() => {
                  onAuthIntent(true);
                  openAuth();
                }}
              >
                Sign in to personalize ↗
              </button>
              <button type="button" onClick={close}>
                Close
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
