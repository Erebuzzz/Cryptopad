import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const MAX_MINUTES = Number(process.env.MAX_MINUTES ?? 60 * 24 * 7);
const DEFAULT_VIEWS = Number(process.env.DEFAULT_VIEWS ?? 10);
const MAX_VIEWS = Number(process.env.MAX_VIEWS ?? 50);

/**
 * Messages live in memory only. Each entry tracks its expiry and how many reads it can serve
 * before we evict it. Zeabur keeps the process warm so this is enough for demo deployments.
 */
const messageStore = new Map();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const originMatchers = allowedOrigins.map(createOriginMatcher);

if (allowedOrigins.length > 0) {
  console.log("cryptopad-api allowing origins", allowedOrigins);
} else {
  console.log("cryptopad-api allowing all origins (no ALLOWED_ORIGINS set)");
}

function escapeRegex(value) {
  return value.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
}

function createOriginMatcher(entry) {
  if (entry === "*") {
    return () => true;
  }

  if (entry.includes("*")) {
    const pattern = `^${entry.split("*").map(escapeRegex).join(".*")}$`;
    const regex = new RegExp(pattern);
    return (value) => regex.test(value);
  }

  return (value) => value === entry;
}

function isOriginAllowed(origin) {
  if (!origin || originMatchers.length === 0) {
    return true;
  }

  return originMatchers.some((matcher) => {
    try {
      return matcher(origin);
    } catch (error) {
      console.warn("cryptopad-api origin matcher failure", error);
      return false;
    }
  });
}

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      console.warn("cryptopad-api blocked origin", origin);
      callback(new Error('Origin not allowed'));
    },
  })
);

app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/message', (req, res) => {
  const { id, encrypted, expiresInMinutes, burnAfterRead, maxViews } = req.body ?? {};

  if (typeof id !== 'string' || id.length < 6 || id.length > 36) {
    return res.status(400).json({ message: 'Invalid id supplied' });
  }

  if (typeof encrypted !== 'string' || encrypted.length === 0 || encrypted.length > 20000) {
    return res.status(400).json({ message: 'Encrypted payload is missing or too large' });
  }

  const minutes = Number(expiresInMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return res.status(400).json({ message: 'Expiry must be a positive number' });
  }

  const safeMinutes = Math.min(minutes, MAX_MINUTES);
  const expiresAt = Date.now() + safeMinutes * 60 * 1000;

  const burnFlag = Boolean(burnAfterRead);
  let remainingViews = 1;

  if (!burnFlag) {
    const parsedViews = Number(maxViews);
    if (Number.isFinite(parsedViews)) {
      remainingViews = Math.min(
        Math.max(Math.floor(parsedViews), 2),
        Math.max(DEFAULT_VIEWS, 2),
        MAX_VIEWS
      );
    } else {
      remainingViews = Math.max(DEFAULT_VIEWS, 2);
    }
  }

  messageStore.set(id, {
    encrypted,
    expiresAt,
    burnAfterRead: burnFlag,
    remainingViews,
    createdAt: Date.now(),
  });

  res.status(201).json({
    expiresAt,
    remainingViews: burnFlag ? null : remainingViews,
  });
});

app.get('/api/message/:id', (req, res) => {
  const id = req.params.id;
  const entry = messageStore.get(id);

  if (!entry) {
    return res.status(404).json({ message: 'Message not found or already burned' });
  }

  if (entry.expiresAt <= Date.now()) {
    messageStore.delete(id);
    return res.status(410).json({ message: 'Message expired' });
  }

  if (entry.remainingViews <= 0) {
    messageStore.delete(id);
    return res.status(404).json({ message: 'Message not found or already burned' });
  }

  let remainingViews = 0;

  if (entry.burnAfterRead) {
    messageStore.delete(id);
  } else {
    entry.remainingViews = Math.max(0, entry.remainingViews - 1);
    remainingViews = entry.remainingViews;

    if (entry.remainingViews <= 0) {
      messageStore.delete(id);
    } else {
      messageStore.set(id, entry);
    }
  }

  res.json({
    encrypted: entry.encrypted,
    expiresAt: entry.expiresAt,
    remainingViews: entry.burnAfterRead ? 0 : remainingViews,
  });
});

app.delete('/api/message/:id', (req, res) => {
  const id = req.params.id;

  if (!messageStore.has(id)) {
    return res.status(404).json({ message: 'Message already gone' });
  }

  messageStore.delete(id);
  res.status(204).send();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error, _req, res, _next) => {
  console.error("cryptopad-api", error);
  res.status(500).json({ message: "Unexpected server error" });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of messageStore) {
    if (entry.expiresAt <= now || entry.remainingViews <= 0) {
      messageStore.delete(id);
    }
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`cryptopad api listening on ${PORT}`);
});
