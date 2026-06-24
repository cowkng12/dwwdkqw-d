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
    missing: config.missing
  };
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
