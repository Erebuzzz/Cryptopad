"use client";

import { FormEvent, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { encryptMessage } from "@/utils/encryption";
import { persistMessage } from "@/lib/message-service";
import { ShareLinkCard } from "@/components/share-link-card";

const EXPIRY_OPTIONS = [
  { label: "10 minutes", value: 10 },
  { label: "1 hour", value: 60 },
  { label: "24 hours", value: 60 * 24 },
  { label: "3 days", value: 60 * 24 * 3 },
] as const;
const MAX_EXPIRY_MINUTES = 60 * 24 * 7;
const MIN_CUSTOM_MINUTES = 5;
const MAX_VIEW_LIMIT = 50;
const MIN_VIEW_LIMIT = 2;
const DEFAULT_VIEW_LIMIT = 5;

const PASSWORD_MIN_LENGTH = 8;
const MAX_MESSAGE_LENGTH = 4000;

function cleanMessage(raw: string): string {
  return raw.replace(/\u0000/g, "").trim();
}

function formatDateInputValue(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

function createDefaultCustomExpiry(): string {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  nextHour.setSeconds(0, 0);
  return formatDateInputValue(nextHour);
}

function describeMinutesFromNow(minutes: number): string {
  if (minutes <= 90) {
    return `${minutes} minutes`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hours`;
  }

  const days = Math.round(minutes / (60 * 24));
  return `${days} days`;
}

function clampViewLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_VIEW_LIMIT;
  }

  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, MIN_VIEW_LIMIT), MAX_VIEW_LIMIT);
}

function inferOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function MessageComposer() {
  const [message, setMessage] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState<number>(EXPIRY_OPTIONS[1].value);
  const [expiryMode, setExpiryMode] = useState<"preset" | "custom">("preset");
  const [customExpiry, setCustomExpiry] = useState<string>("");
  const [burnAfterRead, setBurnAfterRead] = useState(true);
  const [viewLimit, setViewLimit] = useState(DEFAULT_VIEW_LIMIT);
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isProcessing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [servedBy, setServedBy] = useState<"remote" | "local" | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [viewsAllowed, setViewsAllowed] = useState<number | null>(null);

  const charactersLeft = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message]);
  const customExpirySummary = useMemo(() => {
    if (expiryMode !== "custom" || !customExpiry) {
      return null;
    }

    const date = new Date(customExpiry);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    const diffMinutes = Math.ceil((timestamp - Date.now()) / 60000);
    if (diffMinutes <= 0) {
      return null;
    }

    return {
      date,
      minutes: diffMinutes,
      exceedsWindow: diffMinutes > MAX_EXPIRY_MINUTES,
    };
  }, [customExpiry, expiryMode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const sanitized = cleanMessage(message);
    if (!sanitized) {
      setError("Drop a message in before encrypting.");
      return;
    }

    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      setError("Messages cap at 4k characters for now.");
      return;
    }

    let finalPassword = "";
    if (protectWithPassword) {
      finalPassword = password.trim();
      const confirmation = confirmPassword.trim();

      if (finalPassword.length < PASSWORD_MIN_LENGTH) {
        setError("Password needs at least 8 characters.");
        return;
      }

      if (finalPassword !== confirmation) {
        setError("Passwords do not match.");
        return;
      }
    }

    if (!burnAfterRead) {
      const safeLimit = clampViewLimit(viewLimit);

      if (safeLimit < MIN_VIEW_LIMIT) {
        setError(`Team vault mode needs at least ${MIN_VIEW_LIMIT} views.`);
        return;
      }

      if (safeLimit > MAX_VIEW_LIMIT) {
        setError(`Vault view limits max out at ${MAX_VIEW_LIMIT} openings.`);
        return;
      }

      setViewLimit(safeLimit);
    }

    let minutesUntilExpiry = expiryMinutes;
    if (expiryMode === "custom") {
      if (!customExpirySummary) {
        setError("Pick a future date and time for the expiry.");
        return;
      }

      if (customExpirySummary.minutes < MIN_CUSTOM_MINUTES) {
        setError(`Custom expiry needs to be at least ${MIN_CUSTOM_MINUTES} minutes away.`);
        return;
      }

      if (customExpirySummary.exceedsWindow) {
        setError("That schedule goes beyond our 7 day window.");
        return;
      }

      minutesUntilExpiry = customExpirySummary.minutes;
    }

    setProcessing(true);

    try {
      const encryption = encryptMessage(sanitized, {
        password: protectWithPassword ? finalPassword : undefined,
      });
      const id = nanoid(21);

      const response = await persistMessage({
        id,
        encrypted: encryption.payload,
        expiresInMinutes: minutesUntilExpiry,
        burnAfterRead,
        maxViews: burnAfterRead ? undefined : clampViewLimit(viewLimit),
      });

      await new Promise((resolve) => setTimeout(resolve, 420));

      const origin = inferOrigin();
      const url = new URL(`${origin}/view`);
      url.searchParams.set("id", id);
      if (encryption.shareKey) {
        url.searchParams.set("key", encryption.shareKey);
      }

      setShareLink(url.toString());
      setExpiresAt(response.expiresAt);
      setServedBy(response.servedBy);
      setRequiresPassword(encryption.requiresPassword);
      setShareKey(encryption.shareKey ?? null);
      setViewsAllowed(
        burnAfterRead
          ? null
          : typeof response.remainingViews === "number"
            ? response.remainingViews
            : clampViewLimit(viewLimit)
      );
      setMessage("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("cryptopad: failed to persist message", err);
      setError(
        err instanceof Error ? err.message : "Something glitched while saving your note."
      );
    } finally {
      setProcessing(false);
    }
  };

  const resetComposer = () => {
    setShareLink(null);
    setExpiresAt(null);
    setServedBy(null);
    setError(null);
    setRequiresPassword(false);
    setShareKey(null);
    setViewsAllowed(null);
  };

  return (
    <section className="glass-panel mx-auto w-full max-w-3xl px-8 py-10">
      <div className="mb-8 flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.28em] text-indigo-200/70">
          Cryptopad
        </span>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">
          Encrypt a note, share it once
        </h1>
        <p className="max-w-xl text-base text-slate-300">
          We encrypt on the client, stash the cipher temporarily, and send you a link that
          quietly expires after a single view or when the timer runs out.
        </p>
      </div>

      {!shareLink && (
        <form className="space-y-7" onSubmit={handleSubmit}>
          <div className="input-shell">
            <textarea
              name="message"
              aria-label="Secret message"
              className="min-h-[220px] w-full resize-y bg-transparent px-6 py-5 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
              placeholder="Paste secrets, deploy keys, or any text you don't want hanging around."
              value={message}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(event) => setMessage(event.target.value)}
            />
            <div className="flex items-center justify-between px-6 pb-4 text-xs text-slate-500">
              <span>{charactersLeft} chars left</span>
              <span>AES-256 + HMAC integrity</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-sm text-slate-300 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex flex-1 flex-col gap-3">
              <span className="text-xs uppercase tracking-[0.18em] text-indigo-300/80">
                Access policy
              </span>
              <label className="inline-flex items-center gap-2 text-slate-200">
                <input
                  type="radio"
                  name="access-policy"
                  value="burn"
                  checked={burnAfterRead}
                  onChange={() => setBurnAfterRead(true)}
                  className="h-3.5 w-3.5 accent-indigo-500"
                />
                Burn after first view
              </label>
                  <label className="inline-flex items-center gap-2 text-slate-200">
                    <input
                      type="radio"
                      name="access-policy"
                      value="vault"
                      checked={!burnAfterRead}
                      onChange={() => {
                        setBurnAfterRead(false);
                        setViewLimit((current) =>
                          clampViewLimit(current || DEFAULT_VIEW_LIMIT)
                        );
                      }}
                      className="h-3.5 w-3.5 accent-indigo-500"
                    />
                    Team vault (multiple opens)
                  </label>

              {!burnAfterRead && (
                <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
                  <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-indigo-300/80">
                    <span>View limit</span>
                    <input
                      type="number"
                      min={MIN_VIEW_LIMIT}
                      max={MAX_VIEW_LIMIT}
                      value={viewLimit}
                      onChange={(event) =>
                        setViewLimit(clampViewLimit(Number(event.target.value)))
                      }
                      className="w-20 rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-right text-sm text-slate-100 outline-none focus:border-indigo-400/50"
                    />
                  </label>
                  <p className="mt-3 text-xs text-slate-500">
                    Team vault mode keeps the cipher available for the chosen number of views. Once everyone is done, hit “Burn now” from the viewer.
                  </p>
                </div>
              )}
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-[0.18em] text-indigo-300/80">
                  Expiry
                </span>
                <div className="flex items-center gap-3 text-xs text-slate-300">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="expiry-mode"
                      value="preset"
                      checked={expiryMode === "preset"}
                      onChange={() => setExpiryMode("preset")}
                      className="h-3.5 w-3.5 accent-indigo-500"
                    />
                    Presets
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="expiry-mode"
                      value="custom"
                      checked={expiryMode === "custom"}
                      onChange={() => {
                        setExpiryMode("custom");
                        setCustomExpiry((current) => current || createDefaultCustomExpiry());
                      }}
                      className="h-3.5 w-3.5 accent-indigo-500"
                    />
                    Schedule
                  </label>
                </div>
              </div>

              {expiryMode === "preset" ? (
                <select
                  value={expiryMinutes}
                  onChange={(event) => setExpiryMinutes(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-slate-100 outline-none transition hover:border-indigo-400/40"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="datetime-local"
                    className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-slate-100 outline-none transition focus:border-indigo-400/40"
                    value={customExpiry}
                    min={formatDateInputValue(new Date(Date.now() + MIN_CUSTOM_MINUTES * 60 * 1000))}
                    onChange={(event) => setCustomExpiry(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    {customExpirySummary
                      ? customExpirySummary.exceedsWindow
                        ? `That date is ${describeMinutesFromNow(customExpirySummary.minutes)} away. Shorten it to stay within 7 days.`
                        : `Burns in roughly ${describeMinutesFromNow(customExpirySummary.minutes)} (${customExpirySummary.date.toLocaleString()}).`
                      : "Pick a future date within the next 7 days."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-5">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-indigo-400/50 bg-indigo-500/10 accent-indigo-500"
                checked={protectWithPassword}
                onChange={(event) => {
                  setProtectWithPassword(event.target.checked);
                  setPassword("");
                  setConfirmPassword("");
                }}
              />
              Protect with password (PBKDF2 + HMAC)
            </label>

            {protectWithPassword && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-indigo-300/80">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-slate-100 outline-none transition focus:border-indigo-400/50"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-indigo-300/80">
                    Confirm
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat password"
                    className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-slate-100 outline-none transition focus:border-indigo-400/50"
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-slate-500">
                  Heads up: the password never touches the server. Share it out of band so only the
                  intended recipient can decrypt the note.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500/90 px-6 py-4 text-base font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2 text-indigo-100">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-100" />
                Encrypting...
              </span>
            ) : (
              "Encrypt & generate link"
            )}
          </button>
        </form>
      )}

      {shareLink && expiresAt && servedBy && (
        <div className="mt-6">
          <ShareLinkCard
            link={shareLink}
            expiresAt={expiresAt}
            servedBy={servedBy}
            onReset={resetComposer}
            requiresPassword={requiresPassword}
            shareKey={shareKey}
            burnAfterRead={burnAfterRead}
            viewsAllowed={viewsAllowed}
          />
        </div>
      )}
    </section>
  );
}
