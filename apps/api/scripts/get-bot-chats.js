import "dotenv/config";

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required in apps/api/.env");
  }

  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || "Failed to load bot updates");
  }

  const chats = new Map();

  for (const update of payload.result) {
    const chat = update.message?.chat ?? update.edited_message?.chat ?? update.channel_post?.chat;

    if (chat?.id) {
      chats.set(chat.id, chat);
    }
  }

  if (chats.size === 0) {
    console.log("No chats found. Send any message to your bot, then run this command again.");
    return;
  }

  for (const chat of chats.values()) {
    const title = chat.username ? `@${chat.username}` : chat.title ?? `${chat.first_name ?? ""} ${chat.last_name ?? ""}`.trim();
    console.log(`${chat.id} ${title}`.trim());
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
