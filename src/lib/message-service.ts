const STORAGE_KEY = "cryptopad::stash";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export interface PersistPayload {
  id: string;
  encrypted: string;
  expiresInMinutes: number;
  burnAfterRead: boolean;
  maxViews?: number | null;
}

export interface PersistResponse {
  expiresAt: number;
  servedBy: "remote" | "local";
  remainingViews: number | null;
}

export interface FetchResponse {
  encrypted: string;
  expiresAt: number;
  servedBy: "remote" | "local";
  remainingViews: number | null;
}

interface LocalEntry {
  encrypted: string;
  expiresAt: number;
  burnAfterRead: boolean;
  remainingViews: number;
}

/**
 * Save an encrypted message either by hitting the dedicated API or - when developing locally - by
 * stashing it in the browser. This keeps the UI working even before the Zeabur instance is wired up.
 */
export async function persistMessage(payload: PersistPayload): Promise<PersistResponse> {
  if (API_BASE_URL) {
    return persistRemote(payload);
  }

  return persistLocal(payload);
}

/**
 * Fetch and optionally burn a message by id. When we fall back to localStorage we mimic the
 * backend behaviour as closely as possible.
 */
export async function fetchMessage(id: string): Promise<FetchResponse> {
  if (API_BASE_URL) {
    return fetchRemote(id);
  }

  return fetchLocal(id);
}

export async function deleteMessage(id: string): Promise<void> {
  if (API_BASE_URL) {
    return deleteRemote(id);
  }

  return deleteLocal(id);
}

async function persistRemote(payload: PersistPayload): Promise<PersistResponse> {
  const response = await fetch(`${API_BASE_URL}/api/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message ?? "Failed to reach Cryptopad API");
  }

  const data = (await response.json()) as { expiresAt: number; remainingViews?: number | null };
  return {
    expiresAt: data.expiresAt,
    servedBy: "remote",
    remainingViews: typeof data.remainingViews === "number" ? data.remainingViews : null,
  };
}

async function fetchRemote(id: string): Promise<FetchResponse> {
  const response = await fetch(`${API_BASE_URL}/api/message/${id}`);

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message ?? "Message is no longer available");
  }

  const data = (await response.json()) as {
    encrypted: string;
    expiresAt: number;
    remainingViews?: number | null;
  };
  return {
    encrypted: data.encrypted,
    expiresAt: data.expiresAt,
    servedBy: "remote",
    remainingViews: typeof data.remainingViews === "number" ? data.remainingViews : null,
  };
}

async function safeReadError(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? null;
  } catch (error) {
    console.warn("Failed to read API error payload", error);
    return null;
  }
}

function clampViews(value: number): number {
  const min = 2;
  const max = 50;
  return Math.min(Math.max(Math.floor(value), min), max);
}

function persistLocal(payload: PersistPayload): PersistResponse {
  if (typeof window === "undefined") {
    throw new Error("Local storage persistence is only available in the browser");
  }

  const store = readStore();
  const remainingViews = payload.burnAfterRead
    ? 1
    : clampViews(typeof payload.maxViews === "number" ? payload.maxViews : 10);
  store[payload.id] = {
    encrypted: payload.encrypted,
    expiresAt: Date.now() + payload.expiresInMinutes * 60 * 1000,
    burnAfterRead: payload.burnAfterRead,
    remainingViews,
  } satisfies LocalEntry;

  writeStore(store);
  return {
    expiresAt: store[payload.id]!.expiresAt,
    servedBy: "local",
    remainingViews: payload.burnAfterRead ? null : remainingViews,
  };
}

function fetchLocal(id: string): FetchResponse {
  if (typeof window === "undefined") {
    throw new Error("Local storage persistence is only available in the browser");
  }

  const store = readStore();
  const record = store[id];

  if (!record) {
    throw new Error("Message is no longer available");
  }

  if (record.expiresAt <= Date.now()) {
    delete store[id];
    writeStore(store);
    throw new Error("This link has expired");
  }

  if (record.burnAfterRead) {
    delete store[id];
    writeStore(store);
    return {
      encrypted: record.encrypted,
      expiresAt: record.expiresAt,
      servedBy: "local",
      remainingViews: 0,
    };
  } else {
    record.remainingViews = Math.max(0, record.remainingViews - 1);
    const remaining = record.remainingViews;
    if (remaining <= 0) {
      delete store[id];
    } else {
      store[id] = record;
    }
    writeStore(store);
    return {
      encrypted: record.encrypted,
      expiresAt: record.expiresAt,
      servedBy: "local",
      remainingViews: remaining,
    };
  }
}

function readStore(): Record<string, LocalEntry> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);

    if (!existing) {
      return {};
    }

    const parsed = JSON.parse(existing) as Record<string, LocalEntry>;
    pruneExpired(parsed);
    return parsed;
  } catch (error) {
    console.warn("cryptopad: unable to parse local store", error);
    return {};
  }
}

function writeStore(store: Record<string, LocalEntry>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function pruneExpired(store: Record<string, LocalEntry>): void {
  const now = Date.now();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.expiresAt <= now) {
      delete store[key];
      continue;
    }

    if (!entry.burnAfterRead && entry.remainingViews <= 0) {
      delete store[key];
    }
  }
}

async function deleteRemote(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/message/${id}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    const message = await safeReadError(response);
    throw new Error(message ?? "Failed to delete note");
  }
}

function deleteLocal(id: string): void {
  if (typeof window === "undefined") {
    throw new Error("Local storage persistence is only available in the browser");
  }

  const store = readStore();
  if (store[id]) {
    delete store[id];
    writeStore(store);
  }
}
