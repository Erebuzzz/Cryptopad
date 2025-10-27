"use client";

import { useEffect, useMemo, useState } from "react";

interface ShareLinkCardProps {
  link: string;
  expiresAt: number;
  servedBy: "remote" | "local";
  onReset: () => void;
  requiresPassword: boolean;
  shareKey: string | null;
  burnAfterRead: boolean;
  viewsAllowed: number | null;
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes <= 1) {
    return "under a minute";
  }

  if (minutes < 90) {
    return `${minutes} minutes`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} hours`;
  }

  const days = Math.round(minutes / (60 * 24));
  return `${days} days`;
}

export function ShareLinkCard({
  link,
  expiresAt,
  servedBy,
  onReset,
  requiresPassword,
  shareKey,
  burnAfterRead,
  viewsAllowed,
}: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const expiry = useMemo(() => new Date(expiresAt), [expiresAt]);
  const [minutesUntilExpiry, setMinutesUntilExpiry] = useState(() =>
    Math.max(0, Math.round((expiresAt - Date.now()) / 60000))
  );

  useEffect(() => {
    const update = () => {
      setMinutesUntilExpiry(
        Math.max(0, Math.round((expiresAt - Date.now()) / 60000))
      );
    };

    update();

    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const shareMessage = useMemo(() => {
    const viewSummary = burnAfterRead
      ? "one view"
      : viewsAllowed && viewsAllowed > 0
        ? `${viewsAllowed} more view${viewsAllowed === 1 ? "" : "s"}`
        : "the remaining views";

    const expirySummary = `Expires ${expiry.toLocaleString()}`;
    const intro = requiresPassword
      ? "Cryptopad note (password sent separately):"
      : "Cryptopad note (link holds the key):";

    return `${intro} ${link}\n• Burns after ${viewSummary}\n• ${expirySummary}`;
  }, [burnAfterRead, expiry, link, requiresPassword, viewsAllowed]);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent("Encrypted note via Cryptopad");
    const body = encodeURIComponent(shareMessage);
    return `mailto:?subject=${subject}&body=${body}`;
  }, [shareMessage]);

  const smsHref = useMemo(() => {
    const body = encodeURIComponent(shareMessage);
    return `sms:?&body=${body}`;
  }, [shareMessage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      console.warn("cryptopad: failed to copy", error);
    }
  };

  const handleShareCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2200);
    } catch (error) {
      console.warn("cryptopad: failed to copy share message", error);
    }
  };

  return (
    <section className="glass-panel w-full animate-float px-8 py-7 text-slate-200">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-indigo-300/80">
            Link ready
          </p>
          <h2 className="text-2xl font-semibold">Share it once, keep it quiet</h2>
        </div>
        <span className="rounded-full bg-indigo-500/15 px-4 py-1 text-xs font-medium text-indigo-200">
          {requiresPassword ? "Password required" : "Key in link"}
        </span>
      </header>

      <div className="input-shell">
        <button
          type="button"
          onClick={handleCopy}
          className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-sm text-slate-200 transition hover:bg-white/5"
        >
          <span className="max-w-[75%] truncate font-mono text-[0.95rem] text-indigo-50/95">
            {link}
          </span>
          <span className="flex items-center gap-2 rounded-full border border-indigo-400/40 px-4 py-2 text-xs font-medium text-indigo-200 transition group-hover:border-indigo-300 group-hover:bg-indigo-400/10">
            {copied ? "Copied!" : "Copy link"}
          </span>
        </button>
      </div>

      <div className="mt-5 space-y-3 text-sm text-slate-400">
        <p>
          {requiresPassword
            ? "The password stays with you. Share it over a separate channel, not in the same message as this link."
            : "The secret key travels inside the link. Treat the full URL like a password and avoid forwarding it anywhere unsafe."}
        </p>
        {requiresPassword ? (
          <p className="text-xs text-slate-500">
            If you forget the password, the note stays encrypted forever. That is by design.
          </p>
        ) : shareKey ? (
          <p className="text-xs text-slate-500">
            This link bundles a one-time key ({shareKey.length} chars). Regenerate if you suspect it leaked.
          </p>
        ) : null}
        {!burnAfterRead && viewsAllowed !== null && (
          <p className="text-xs text-slate-500">
            Vault mode allows up to {viewsAllowed} total openings. Remind collaborators to burn the note once the team is done.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2 text-xs uppercase tracking-[0.18em] text-indigo-300/70">
        <span>Share helpers</span>
        <div className="flex flex-wrap gap-3 text-sm text-slate-200">
          <button
            type="button"
            onClick={handleShareCopy}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 px-4 py-2 transition hover:border-indigo-300 hover:bg-indigo-400/10"
          >
            {shareCopied ? "Copied summary" : "Copy summary"}
          </button>
          <a
            href={mailtoHref}
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 px-4 py-2 transition hover:border-indigo-300 hover:bg-indigo-400/10"
          >
            Email draft
          </a>
          <a
            href={smsHref}
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 px-4 py-2 transition hover:border-indigo-300 hover:bg-indigo-400/10"
          >
            SMS draft
          </a>
        </div>
      </div>

      <footer className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>
          Expires in <strong className="text-slate-100">{formatRelativeMinutes(minutesUntilExpiry)}</strong> ({expiry.toLocaleString()})
        </span>
        <span className="hidden sm:inline" aria-hidden>|</span>
        <span className="text-slate-500">
          {servedBy === "remote"
            ? "Stored on the Zeabur edge cache until it burns out."
            : "Stored locally for now - perfect while prototyping."}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-indigo-300 transition hover:text-indigo-200"
        >
          Generate another
        </button>
      </footer>
    </section>
  );
}
