import CryptoJS from "crypto-js";

const ENVELOPE_VERSION = "1.1.0";
const MASTER_KEY_BYTES = 64;
const PBKDF2_ITERATIONS = 150_000;
const SALT_BYTES = 16;
const IV_BYTES = 16;

type EncryptionMode = "link" | "password";

interface EncryptionEnvelope {
  version: string;
  mode: EncryptionMode;
  ciphertext: string;
  iv: string;
  salt: string | null;
  hmac: string;
  iterations: number;
  createdAt: number;
}

interface HmacPayload {
  mode: EncryptionMode;
  ciphertext: string;
  iv: string;
  salt: string | null;
  createdAt: number;
}

export interface EncryptOptions {
  password?: string;
}

export interface EncryptResult {
  payload: string;
  shareKey?: string;
  requiresPassword: boolean;
  integrity: string;
}

export interface DecryptOptions {
  key?: string;
  password?: string;
}

export interface EnvelopeInspection {
  mode: EncryptionMode;
  version: string;
  createdAt: number;
}

export function encryptMessage(message: string, options: EncryptOptions = {}): EncryptResult {
  const iv = CryptoJS.lib.WordArray.random(IV_BYTES);
  const ivBase64 = CryptoJS.enc.Base64.stringify(iv);
  const createdAt = Date.now();

  if (options.password) {
    const saltWord = CryptoJS.lib.WordArray.random(SALT_BYTES);
    const { aesKey, hmacKey } = deriveKeyFromPassword(options.password, saltWord, PBKDF2_ITERATIONS);

    const cipher = CryptoJS.AES.encrypt(message, aesKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const ciphertext = CryptoJS.enc.Base64.stringify(cipher.ciphertext);
    const saltBase64 = CryptoJS.enc.Base64.stringify(saltWord);
    const hmac = computeIntegrity(
      {
        mode: "password",
        ciphertext,
        iv: ivBase64,
        salt: saltBase64,
        createdAt,
      },
      hmacKey,
    );

    const envelope: EncryptionEnvelope = {
      version: ENVELOPE_VERSION,
      mode: "password",
      ciphertext,
      iv: ivBase64,
      salt: saltBase64,
      hmac,
      iterations: PBKDF2_ITERATIONS,
      createdAt,
    };

    return {
      payload: JSON.stringify(envelope),
      requiresPassword: true,
      integrity: hmac,
    } satisfies EncryptResult;
  }

  const masterKey = CryptoJS.lib.WordArray.random(MASTER_KEY_BYTES);
  const { aesKey, hmacKey } = splitMasterKey(masterKey);

  const cipher = CryptoJS.AES.encrypt(message, aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ciphertext = CryptoJS.enc.Base64.stringify(cipher.ciphertext);
  const hmac = computeIntegrity(
    {
      mode: "link",
      ciphertext,
      iv: ivBase64,
      salt: null,
      createdAt,
    },
    hmacKey,
  );

  const envelope: EncryptionEnvelope = {
    version: ENVELOPE_VERSION,
    mode: "link",
    ciphertext,
    iv: ivBase64,
    salt: null,
    hmac,
    iterations: PBKDF2_ITERATIONS,
    createdAt,
  };

  return {
    payload: JSON.stringify(envelope),
    shareKey: CryptoJS.enc.Base64.stringify(masterKey),
    requiresPassword: false,
    integrity: hmac,
  } satisfies EncryptResult;
}

export function decryptMessage(payload: string, options: DecryptOptions = {}): string {
  const envelope = tryParseEnvelope(payload);

  if (!envelope) {
    if (!options.key) {
      throw new Error("Legacy note requires a key from the link.");
    }

    const decrypted = CryptoJS.AES.decrypt(payload, options.key).toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      throw new Error("Unable to decrypt legacy payload with provided key.");
    }

    return decrypted;
  }

  const iv = CryptoJS.enc.Base64.parse(envelope.iv);

  let aesKey: CryptoJS.lib.WordArray;
  let hmacKey: CryptoJS.lib.WordArray;

  if (envelope.mode === "password") {
    if (!options.password) {
      throw new Error("This note is protected by a password.");
    }

    if (!envelope.salt) {
      throw new Error("Encrypted payload is missing salt information.");
    }

    const saltWord = CryptoJS.enc.Base64.parse(envelope.salt);
    ({ aesKey, hmacKey } = deriveKeyFromPassword(
      options.password,
      saltWord,
      envelope.iterations ?? PBKDF2_ITERATIONS,
    ));
  } else {
    if (!options.key) {
      throw new Error("Missing secret key in link.");
    }

    const masterKey = CryptoJS.enc.Base64.parse(options.key);
    ({ aesKey, hmacKey } = splitMasterKey(masterKey));
  }

  const expectedIntegrity = computeIntegrity(
    {
      mode: envelope.mode,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      salt: envelope.salt,
      createdAt: envelope.createdAt,
    },
    hmacKey,
  );

  if (!timingSafeEqual(expectedIntegrity, envelope.hmac)) {
    throw new Error("Message integrity check failed. The payload may have been altered.");
  }

  const ciphertextParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(envelope.ciphertext),
  });

  const decrypted = CryptoJS.AES.decrypt(ciphertextParams, aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);

  if (!decrypted) {
    throw new Error("Unable to decrypt with the supplied credentials.");
  }

  return decrypted;
}

export function inspectEncryptedPayload(payload: string): EnvelopeInspection {
  const envelope = tryParseEnvelope(payload);

  if (!envelope) {
    return {
      mode: "link",
      version: "legacy",
      createdAt: 0,
    } satisfies EnvelopeInspection;
  }

  return {
    mode: envelope.mode,
    version: envelope.version,
    createdAt: envelope.createdAt,
  } satisfies EnvelopeInspection;
}

function deriveKeyFromPassword(
  password: string,
  salt: CryptoJS.lib.WordArray,
  iterations: number,
): { aesKey: CryptoJS.lib.WordArray; hmacKey: CryptoJS.lib.WordArray } {
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: MASTER_KEY_BYTES / 4,
    iterations,
  });

  return splitDerivedKey(derived);
}

function splitMasterKey(masterKey: CryptoJS.lib.WordArray) {
  const hex = masterKey.toString(CryptoJS.enc.Hex);
  const aesHex = hex.slice(0, 64);
  const hmacHex = hex.slice(64, 128);

  return {
    aesKey: CryptoJS.enc.Hex.parse(aesHex),
    hmacKey: CryptoJS.enc.Hex.parse(hmacHex),
  };
}

function splitDerivedKey(derived: CryptoJS.lib.WordArray) {
  const hex = derived.toString(CryptoJS.enc.Hex);
  const aesHex = hex.slice(0, 64);
  const hmacHex = hex.slice(64, 128);

  return {
    aesKey: CryptoJS.enc.Hex.parse(aesHex),
    hmacKey: CryptoJS.enc.Hex.parse(hmacHex),
  };
}

function computeIntegrity(payload: HmacPayload, key: CryptoJS.lib.WordArray): string {
  const segments = [
    payload.mode,
    payload.ciphertext,
    payload.iv,
    payload.salt ?? "",
    String(payload.createdAt ?? 0),
    ENVELOPE_VERSION,
  ];

  return CryptoJS.HmacSHA256(segments.join("|"), key).toString(CryptoJS.enc.Base64);
}

function tryParseEnvelope(payload: string): EncryptionEnvelope | null {
  try {
    const parsed = JSON.parse(payload) as EncryptionEnvelope;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (parsed.version !== ENVELOPE_VERSION) {
      return null;
    }

    if (parsed.mode !== "link" && parsed.mode !== "password") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}
