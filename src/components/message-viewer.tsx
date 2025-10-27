"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { deleteMessage, fetchMessage } from "@/lib/message-service";
import { decryptMessage, inspectEncryptedPayload } from "@/utils/encryption";

interface MessageViewerProps {
  id?: string;
  keyParam?: string;
}

type NoteMode = "link" | "password" | "legacy";

type ViewerPhase = "idle" | "loading" | "awaiting-password" | "ready" | "error" | "burned";

interface NoteMeta {
  encrypted: string;
  expiresAt: number;
  servedBy: "remote" | "local";
  mode: NoteMode;
  remainingViews: number | null;
}

function SelfDestructMessage({ message }: { message: string }) {
  const [isBurned, setBurned] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setBurned(true), 15000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 px-7 py-6 font-mono text-[0.95rem] leading-relaxed text-indigo-100 shadow-inner transition ${
        isBurned ? "opacity-30 blur-[1px]" : "opacity-100"
      }`}
    >
      {message.split(/\n/g).map((line, index) => (
        <p key={`${index}-${line}`} className="whitespace-pre-wrap">
          {line || "\u00A0"}
        </p>
      ))}
    </article>
  );
}

export function MessageViewer({ id, keyParam }: MessageViewerProps) {
  const [phase, setPhase] = useState<ViewerPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [noteMeta, setNoteMeta] = useState<NoteMeta | null>(null);
  const [message, setMessage] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setPhase("error");
      setError("Missing note id in the URL.");
      return;
    }

    const noteId = id;
    let cancelled = false;

    async function hydrate() {
      setPhase("loading");
      setError(null);
      setPasswordError(null);
      setBurnError(null);

      try {
        await new Promise((resolve) => setTimeout(resolve, 360));
        const payload = await fetchMessage(noteId);
        if (cancelled) {
          return;
        }

        const inspection = inspectEncryptedPayload(payload.encrypted);
        const mode: NoteMode = inspection.version === "legacy" ? "legacy" : inspection.mode;

        const meta: NoteMeta = {
          encrypted: payload.encrypted,
          expiresAt: payload.expiresAt,
          servedBy: payload.servedBy,
          mode,
          remainingViews: payload.remainingViews ?? null,
        };

        setNoteMeta(meta);

        if (mode === "password") {
          setPhase("awaiting-password");
          return;
        }

        if (!keyParam) {
          setPhase("error");
          setError("This link is missing its secret key.");
          return;
        }

        try {
          const decrypted = decryptMessage(payload.encrypted, { key: keyParam });
          if (cancelled) {
            return;
          }

          setMessage(decrypted);
          setPhase("ready");
        } catch (err) {
          if (cancelled) {
            return;
          }

          setPhase("error");
          setError(err instanceof Error ? err.message : "Unable to decrypt this note.");
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setPhase("error");
        setError(err instanceof Error ? err.message : "This note is no longer retrievable.");
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [id, keyParam]);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!noteMeta) {
      return;
    }

    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setPasswordError("Enter the password you received.");
      return;
    }

    setIsVerifying(true);
    setPasswordError(null);

    try {
      const decrypted = decryptMessage(noteMeta.encrypted, { password: trimmed });
      setMessage(decrypted);
      setPhase("ready");
      setPasswordInput("");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Unable to decrypt with that password."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (phase === "error") {
    return (
      <section className="glass-panel mx-auto mt-16 w-full max-w-2xl px-8 py-10 text-center text-slate-200">
        <h1 className="text-3xl font-semibold">Nothing to see here</h1>
        <p className="mt-3 text-slate-400">{error}</p>
        <p className="mt-6 text-sm text-slate-500">
          Secret links burn after a single view or when their timer expires. If you need to
          share something new, start fresh below.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          Create a new encrypted note
        </Link>
      </section>
    );
  }

  if (phase === "loading" || phase === "idle") {
    return (
      <section className="glass-panel mx-auto mt-16 w-full max-w-2xl px-8 py-12 text-center text-slate-200">
        <span className="inline-flex items-center gap-3 text-indigo-200">
          <span className="h-3 w-3 animate-ping rounded-full bg-indigo-200" />
          Decrypting the note...
        </span>
      </section>
    );
  }

  if (phase === "burned") {
    return (
      <section className="glass-panel mx-auto mt-16 w-full max-w-2xl px-8 py-10 text-center text-slate-200">
        <h1 className="text-3xl font-semibold">Vault destroyed</h1>
        <p className="mt-3 text-slate-400">
          The secret is gone for good. Give collaborators a heads-up that the link now returns an expired notice.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          Encrypt another note
        </Link>
      </section>
    );
  }

  if (phase === "awaiting-password" && noteMeta) {
    return (
      <section className="glass-panel mx-auto mt-16 w-full max-w-2xl px-9 py-12 text-slate-200">
        <header className="mb-6 text-center sm:text-left">
          <p className="text-xs uppercase tracking-[0.24em] text-indigo-200/70">Password needed</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Unlock the note.</h1>
          <p className="mt-2 text-sm text-slate-400">
            This link already burned the stored cipher. Enter the password that was shared with you
            to decrypt it locally.
          </p>
          {noteMeta.remainingViews !== null && (
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-indigo-200/70">
              Views remaining after this attempt: {noteMeta.remainingViews}
            </p>
          )}
        </header>

        <form className="space-y-5" onSubmit={handlePasswordSubmit}>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.18em] text-indigo-300/80">
              Password
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-indigo-400/50"
              placeholder="Enter the shared password"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-rose-300">{passwordError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500/90 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
          >
            {isVerifying ? "Decrypting..." : "Decrypt note"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          Forgot the password? The cipher cannot be recovered without it.
        </p>
      </section>
    );
  }

  if (phase === "ready" && noteMeta) {
    return (
      <section className="glass-panel mx-auto mt-16 w-full max-w-2xl px-9 py-12 text-slate-200">
        <header className="mb-7 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-indigo-200/70">
          <span>Decrypted note</span>
          <span className="hidden sm:inline" aria-hidden>
            |
          </span>
          <span>{noteMeta.servedBy === "remote" ? "Served by Zeabur API" : "Local dev cache"}</span>
          {noteMeta.expiresAt && (
            <span className="hidden w-full text-[0.68rem] normal-case text-slate-400 sm:inline sm:w-auto">
              Expired link cleanup kicks in at {new Date(noteMeta.expiresAt).toLocaleString()}
            </span>
          )}
          <span className="hidden w-full text-[0.68rem] normal-case text-slate-500 sm:inline sm:w-auto">
            {noteMeta.mode === "password" ? "Password-derived key (PBKDF2 + HMAC)." : "Secret key pulled from the link."}
          </span>
          {noteMeta.remainingViews !== null && (
            <span className="hidden w-full text-[0.68rem] normal-case text-indigo-200/80 sm:inline sm:w-auto">
              Views remaining after this one: {noteMeta.remainingViews}
            </span>
          )}
        </header>

        <SelfDestructMessage key={message} message={message} />

        <footer className="mt-7 flex flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {noteMeta.remainingViews !== null
              ? noteMeta.remainingViews > 0
                ? `Vault stays available for ${noteMeta.remainingViews} more view${noteMeta.remainingViews === 1 ? "" : "s"}. Burn it early once the team is done.`
                : "That was the final view. Anyone refreshing will see the expired notice."
              : "Burned from the server as soon as you opened it. Refreshing will show the expired notice."}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
            {!noteMeta.remainingViews || noteMeta.remainingViews <= 0 ? null : (
              <button
                type="button"
                onClick={async () => {
                  if (!id) {
                    return;
                  }

                  setIsBurning(true);
                  setBurnError(null);

                  try {
                    await deleteMessage(id);
                    setPhase("burned");
                  } catch (err) {
                    setBurnError(
                      err instanceof Error ? err.message : "Unable to burn the vault right now."
                    );
                  } finally {
                    setIsBurning(false);
                  }
                }}
                disabled={isBurning}
                className="inline-flex items-center justify-center rounded-full border border-rose-400/50 px-5 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-300 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-rose-200/40"
              >
                {isBurning ? "Burning..." : "Burn now"}
              </button>
            )}
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-indigo-400/40 px-5 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-300 hover:bg-indigo-400/10"
            >
              Encrypt another
            </Link>
          </div>
        </footer>
        {burnError && (
          <p className="mt-3 text-xs text-rose-300">{burnError}</p>
        )}
      </section>
    );
  }

  return null;
}
