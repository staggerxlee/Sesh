"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowLeft, Mail, Loader2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { api, clearCsrf, csrf } from "@/lib/api";
import { broadcast, useSesh } from "@/lib/store";
export function AuthDialog() {
  const { authOpen, setAuthOpen, refresh, notify } = useSesh();
  const [mode, setMode] = useState<
    "register" | "login" | "forgot" | "reset" | "verify"
  >("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState("");
  const [uid, setUid] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("token")) {
      setToken(q.get("token") || "");
      setUid(q.get("uid") || q.get("uidb64") || "");
      setMode(window.location.pathname.includes("verify") ? "verify" : "reset");
      setAuthOpen(true);
    }
  }, [setAuthOpen]);
  useEffect(() => {
    setError("");
    setSent(false);
    setPassword("");
  }, [mode]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "forgot") {
        await api("/auth/password-reset/", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setSent(true);
      } else if (mode === "reset") {
        await api("/auth/reset-confirm/", {
          method: "POST",
          body: JSON.stringify({
            uid,
            uidb64: uid,
            token,
            password,
            new_password: password,
          }),
        });
        setMode("login");
        notify("Your password has been updated.");
        window.history.replaceState({}, "", "/");
      } else if (mode === "verify") {
        await api("/auth/verify-email/", {
          method: "POST",
          body: JSON.stringify({ uid, token }),
        });
        notify("Your email is verified.");
        setAuthOpen(false);
        await refresh();
        window.history.replaceState({}, "", "/");
      } else {
        await api(`/auth/${mode}/`, {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            first_name: name,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        clearCsrf();
        await csrf();
        await refresh();
        broadcast();
        setAuthOpen(false);
        notify(
          mode === "register"
            ? "Your space is ready. Add a subject to begin."
            : "Welcome back. Make yourself at home.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const title = {
    register: "A little space, just for you.",
    login: "Welcome back.",
    forgot: "A fresh start.",
    reset: "Choose a new password.",
    verify: "Make it official.",
  }[mode];
  return (
    <Modal
      open={authOpen}
      onOpenChange={setAuthOpen}
      title={title}
      description={
        mode === "register"
          ? "Create your account. Find your focus."
          : mode === "login"
            ? "Pick up where you left off."
            : mode === "forgot"
              ? "We’ll email you a link to reset your password."
              : mode === "reset"
                ? "Use at least 10 characters to keep your account secure."
                : "Confirm your email to complete your account."
      }
    >
      <form className="auth-form" onSubmit={submit}>
        {sent ? (
          <div className="auth-sent">
            <Mail size={28} />
            <h3>Check your inbox</h3>
            <p>
              If an account exists for this address, a reset link is on its way.
            </p>
          </div>
        ) : (
          <>
            {mode === "register" && (
              <label className="field">
                Your name
                <input
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={150}
                  required
                />
              </label>
            )}
            {(mode === "register" || mode === "login" || mode === "forgot") && (
              <label className="field">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
            )}
            {mode !== "forgot" && mode !== "verify" && (
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "login"
                      ? "Your password"
                      : "At least 10 characters"
                  }
                  required
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? (
                <Loader2 size={17} className="spin" />
              ) : mode === "register" ? (
                "Create your space"
              ) : mode === "login" ? (
                "Sign in"
              ) : mode === "forgot" ? (
                "Send reset link"
              ) : mode === "reset" ? (
                "Update password"
              ) : (
                "Verify email"
              )}
              {!busy && <ArrowRight size={17} />}
            </Button>
          </>
        )}
        {mode === "login" && (
          <button
            type="button"
            className="text-button"
            onClick={() => setMode("forgot")}
          >
            Forgot your password?
          </button>
        )}
        <div className="auth-switch">
          {mode === "register" ? (
            <>
              Already have a space?{" "}
              <button type="button" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          ) : mode === "login" ? (
            <>
              New to Sesh?{" "}
              <button type="button" onClick={() => setMode("register")}>
                Create an account
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("login")}>
              <ArrowLeft size={13} /> Back to sign in
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
