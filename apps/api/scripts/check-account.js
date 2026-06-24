import "dotenv/config";
import { getTelegramConfig } from "../src/telegram/config.js";
import { getTelegramAccount } from "../src/telegram/client.js";

async function main() {
  const config = getTelegramConfig();

  if (!config.apiId || !config.apiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required in apps/api/.env");
  }

  if (!config.session) {
    throw new Error("TELEGRAM_SESSION is required. Run npm --workspace @mrkt/api run telegram:session first");
  }

  const account = await getTelegramAccount();

  if (!account.authorized) {
    throw new Error("Telegram session is not authorized. Generate a new TELEGRAM_SESSION");
  }

  const username = account.user.username ? `@${account.user.username}` : "no username";

  console.log("Telegram account connected.");
  console.log(`User: ${account.user.firstName ?? ""} ${account.user.lastName ?? ""}`.trim());
  console.log(`Username: ${username}`);
  console.log(`ID: ${account.user.id}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
