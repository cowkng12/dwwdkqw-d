import { Api } from "telegram";
import { createTelegramClient } from "../telegram/client.js";

const MRKT_API_URL = "https://api.tgmrkt.io/api/v1";

let cachedToken = null;

function extractInitData(webViewUrl) {
  const marker = "tgWebAppData=";
  const start = webViewUrl.indexOf(marker);

  if (start === -1) {
    throw new Error("tgWebAppData not found in MRKT WebView URL");
  }

  const value = webViewUrl.slice(start + marker.length).split("&tgWebAppVersion", 1)[0];
  return decodeURIComponent(value);
}

async function requestMrktToken(initData) {
  const response = await fetch(`${MRKT_API_URL}/auth`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ data: initData })
  });

  const payload = await response.json();

  if (!response.ok || !payload.token) {
    throw new Error(payload.message || payload.error || "MRKT auth token request failed");
  }

  return payload.token;
}

export async function getMrktAuthToken() {
  if (process.env.MRKT_AUTH_TOKEN?.trim()) {
    return process.env.MRKT_AUTH_TOKEN.trim();
  }

  if (cachedToken) {
    return cachedToken;
  }

  const client = createTelegramClient();
  await client.connect();

  try {
    if (!(await client.isUserAuthorized())) {
      throw new Error("Telegram session is not authorized. Run telegram:session first");
    }

    const resolved = await client.invoke(
      new Api.contacts.ResolveUsername({
        username: "mrkt"
      })
    );

    const botUser = resolved.users[0];

    if (!botUser?.id || !botUser?.accessHash) {
      throw new Error("Cannot resolve @mrkt bot user");
    }

    const bot = new Api.InputUser({
      userId: botUser.id,
      accessHash: botUser.accessHash
    });

    const peer = new Api.InputPeerUser({
      userId: botUser.id,
      accessHash: botUser.accessHash
    });

    const webView = await client.invoke(
      new Api.messages.RequestAppWebView({
        peer,
        app: new Api.InputBotAppShortName({
          botId: bot,
          shortName: "app"
        }),
        platform: "android"
      })
    );

    cachedToken = await requestMrktToken(extractInitData(webView.url));
    return cachedToken;
  } finally {
    await client.disconnect();
  }
}
