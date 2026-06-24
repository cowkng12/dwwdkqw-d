import "dotenv/config";
import input from "input";
import { StringSession } from "telegram/sessions/index.js";
import { TelegramClient } from "telegram";
import { getTelegramConfig } from "../src/telegram/config.js";

async function main() {
  const config = getTelegramConfig();

  if (!config.apiId || !config.apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required in apps/api/.env");
  }

  const client = new TelegramClient(new StringSession(config.session ?? ""), config.apiId, config.apiHash, {
    connectionRetries: 5
  });

  await client.start({
    phoneNumber: async () => input.text("Phone number: "),
    password: async () => input.text("2FA password (if enabled): "),
    phoneCode: async () => input.text("Login code: "),
    onError: (error) => {
      throw error;
    }
  });

  console.log("Telegram session generated.");
  console.log("Paste this into apps/api/.env as TELEGRAM_SESSION:");
  console.log(client.session.save());

  await client.disconnect();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
