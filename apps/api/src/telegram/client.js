import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { getTelegramConfig } from "./config.js";

export function createTelegramClient() {
  const config = getTelegramConfig();

  if (!config.apiId || !config.apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required");
  }

  if (!config.session) {
    throw new Error("TELEGRAM_SESSION is required");
  }

  return new TelegramClient(new StringSession(config.session), config.apiId, config.apiHash, {
    connectionRetries: 5
  });
}

export async function getTelegramAccount() {
  const client = createTelegramClient();

  await client.connect();

  try {
    const authorized = await client.isUserAuthorized();

    if (!authorized) {
      return {
        connected: false,
        authorized: false,
        user: null
      };
    }

    const me = await client.getMe();

    return {
      connected: true,
      authorized: true,
      user: {
        id: me.id?.toString() ?? null,
        firstName: me.firstName ?? null,
        lastName: me.lastName ?? null,
        username: me.username ?? null,
        phone: me.phone ?? null
      }
    };
  } finally {
    await client.disconnect();
  }
}
