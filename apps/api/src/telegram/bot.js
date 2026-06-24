import { isTelegramUserAllowed } from "./access.js";

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function describeTelegramFailure(payload, fallbackMessage) {
  return payload?.description || payload?.error_code ? `${payload?.error_code ?? "telegram"}: ${payload?.description ?? fallbackMessage}` : fallbackMessage;
}

function getMiniAppUrl() {
  return normalizeString(process.env.TELEGRAM_WEB_APP_URL ?? process.env.WEB_APP_URL ?? process.env.MINI_APP_URL);
}

function createMiniAppKeyboard() {
  const miniAppUrl = getMiniAppUrl();

  if (!miniAppUrl) {
    return null;
  }

  return {
    inline_keyboard: [
      [
        {
          text: "Открыть Mini App",
          web_app: { url: miniAppUrl }
        }
      ]
    ]
  };
}

async function callTelegramBotApi(method, body) {
  const config = getBotConfig();

  if (!config.token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(describeTelegramFailure(payload, `Telegram ${method} failed`));
  }

  return payload.result;
}

async function sendBotMessage(chatId, text, options = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (options.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }

  return callTelegramBotApi("sendMessage", body);
}

export function getBotConfig() {
  const token = normalizeString(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = normalizeString(process.env.TELEGRAM_ALERT_CHAT_ID);

  return {
    token,
    chatId,
    isConfigured: Boolean(token && chatId),
    missing: {
      token: !token,
      chatId: !chatId
    }
  };
}

export function getBotStatus() {
  const config = getBotConfig();

  return {
    isConfigured: config.isConfigured,
    missing: config.missing,
    hasMiniAppUrl: Boolean(getMiniAppUrl())
  };
}

export async function setupTelegramBot() {
  const webhookBaseUrl = normalizeString(process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL);
  const miniAppUrl = getMiniAppUrl();

  if (!webhookBaseUrl) {
    throw new Error("PUBLIC_API_URL or RENDER_EXTERNAL_URL is required");
  }

  const webhookUrl = `${webhookBaseUrl.replace(/\/$/, "")}/telegram/webhook`;

  await callTelegramBotApi("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть MRKT Mini App" },
      { command: "help", description: "Как работает бот" },
      { command: "status", description: "Проверить подключение" }
    ]
  });

  if (miniAppUrl) {
    await callTelegramBotApi("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "MRKT App",
        web_app: { url: miniAppUrl }
      }
    });
  }

  await callTelegramBotApi("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message"]
  });

  return { webhookUrl, miniAppUrl };
}

export async function handleTelegramWebhook(update) {
  const message = update?.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id ?? chatId;
  const text = String(message?.text ?? "").trim();

  if (!chatId || !text.startsWith("/")) {
    return { handled: false };
  }

  if (!isTelegramUserAllowed(userId)) {
    await sendBotMessage(chatId, "Нет доступа. Этот бот работает только для whitelist пользователей.");
    return { handled: true, command: "access-denied" };
  }

  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const replyMarkup = createMiniAppKeyboard();

  if (command === "/start") {
    await sendBotMessage(
      chatId,
      [
        "<b>WORKMKRT запущен</b>",
        "",
        "Я ищу дешевые MRKT-подарки, монохромные модели и кандидатов для перепродажи.",
        "Открой Mini App, чтобы смотреть найденные лоты, фильтры и статусы."
      ].join("\n"),
      { replyMarkup }
    );

    return { handled: true, command };
  }

  if (command === "/help") {
    await sendBotMessage(
      chatId,
      [
        "<b>Команды</b>",
        "/start - открыть Mini App",
        "/status - проверить подключение",
        "",
        "Алерты приходят автоматически, когда сканер находит подходящий лот."
      ].join("\n"),
      { replyMarkup }
    );

    return { handled: true, command };
  }

  if (command === "/status") {
    await sendBotMessage(
      chatId,
      [
        "<b>Статус</b>",
        `Mini App: ${getMiniAppUrl() ? "подключен" : "не задан TELEGRAM_WEB_APP_URL"}`,
        `Alerts chat: ${getBotConfig().chatId ? "подключен" : "не задан TELEGRAM_ALERT_CHAT_ID"}`
      ].join("\n"),
      { replyMarkup }
    );

    return { handled: true, command };
  }

  await sendBotMessage(chatId, "Не знаю такую команду. Используй /start или /help.", { replyMarkup });
  return { handled: true, command };
}

export async function sendTelegramAlert(text, options = {}) {
  const config = getBotConfig();

  if (!config.token || !config.chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID are required");
  }

  const replyMarkup = options.url
    ? {
        inline_keyboard: [
          [
            {
              text: "Открыть лот",
              url: options.url
            }
          ]
        ]
      }
    : null;

  if (options.photoBuffer) {
    const form = new FormData();
    form.append("chat_id", config.chatId);
    form.append("photo", new Blob([options.photoBuffer], { type: "image/png" }), options.photoFilename ?? "gift-preview.png");
    form.append("caption", text.slice(0, 1024));
    form.append("parse_mode", "HTML");

    if (replyMarkup) {
      form.append("reply_markup", JSON.stringify(replyMarkup));
    }

    const uploadResponse = await fetch(`https://api.telegram.org/bot${config.token}/sendPhoto`, {
      method: "POST",
      body: form
    });

    const uploadPayload = await uploadResponse.json();

    if (uploadResponse.ok && uploadPayload.ok) {
      return uploadPayload.result;
    }

    console.error(`Telegram sendPhoto upload failed: ${describeTelegramFailure(uploadPayload, "unknown upload error")}`);
  }

  if (options.photoUrl) {
    const photoBody = {
      chat_id: config.chatId,
      photo: options.photoUrl,
      caption: text.slice(0, 1024),
      parse_mode: "HTML"
    };

    if (replyMarkup) {
      photoBody.reply_markup = replyMarkup;
    }

    const photoResponse = await fetch(`https://api.telegram.org/bot${config.token}/sendPhoto`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(photoBody)
    });

    const photoPayload = await photoResponse.json();

    if (photoResponse.ok && photoPayload.ok) {
      return photoPayload.result;
    }

    console.error(`Telegram sendPhoto URL failed: ${describeTelegramFailure(photoPayload, "unknown photo URL error")}`);
  }

  const body = {
    chat_id: config.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(describeTelegramFailure(payload, "Telegram bot notification failed"));
  }

  return payload.result;
}
