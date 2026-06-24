import "dotenv/config";
import { setupTelegramBot } from "../src/telegram/bot.js";

setupTelegramBot()
  .then((result) => {
    console.log(`Telegram webhook: ${result.webhookUrl}`);
    console.log(`Telegram Mini App: ${result.miniAppUrl ?? "not configured"}`);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
