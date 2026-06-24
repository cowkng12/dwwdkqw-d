import crypto from "node:crypto";

function getAllowedTelegramUserIds() {
  return String(process.env.ALLOWED_TELEGRAM_USER_IDS ?? process.env.TELEGRAM_ALERT_CHAT_ID ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isTelegramUserAllowed(userId) {
  const allowedIds = getAllowedTelegramUserIds();

  if (allowedIds.length === 0) {
    return true;
  }

  return allowedIds.includes(String(userId));
}

export function getTelegramAccessStatus() {
  return {
    enabled: getAllowedTelegramUserIds().length > 0,
    allowedUserIds: getAllowedTelegramUserIds()
  };
}

export function verifyTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for Mini App access checks");
  }

  const params = new URLSearchParams(initData ?? "");
  const hash = params.get("hash");

  if (!hash) {
    throw new Error("Telegram initData hash is missing");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(hash) || hash.length !== expectedHash.length) {
    throw new Error("Telegram initData hash is invalid");
  }

  if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"))) {
    throw new Error("Telegram initData hash is invalid");
  }

  const user = JSON.parse(params.get("user") ?? "null");

  if (!user?.id) {
    throw new Error("Telegram initData user is missing");
  }

  if (!isTelegramUserAllowed(user.id)) {
    throw new Error("Telegram user is not allowed");
  }

  return user;
}
