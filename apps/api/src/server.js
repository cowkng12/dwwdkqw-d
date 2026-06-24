import "dotenv/config";
import cors from "cors";
import express from "express";
import { items, purchases, rules, users } from "./data/store.js";
import { getTelegramStatus } from "./telegram/config.js";
import { getTelegramAccount } from "./telegram/client.js";
import { getBotStatus, handleTelegramWebhook, setupTelegramBot } from "./telegram/bot.js";
import { getTelegramAccessStatus, verifyTelegramInitData } from "./telegram/access.js";
import { getAlertDashboardData, runMarketAlertScanSafely } from "./monitor/alerts.js";
import { getScanPreferences, updateScanPreferences } from "./market/scan-config.js";
import { updateAlertCandidateStatus } from "./monitor/candidates-store.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function requireMiniAppAccess(req, res, next) {
  try {
    req.telegramUser = verifyTelegramInitData(req.get("x-telegram-init-data"));
    return next();
  } catch (error) {
    return res.status(403).json({ error: error.message || "Mini App access denied" });
  }
}

function renderMiniAppHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
  <title>WORKMKRT</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; font-family: Arial, Helvetica, sans-serif; background: #000; color: #f6f6f6; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, rgba(255,255,255,.08), transparent 28%), #000; }
    main { width: min(980px, 100%); margin: 0 auto; padding: 22px 14px 42px; }
    .hero { padding: 22px 18px; border: 1px solid rgba(255,255,255,.12); border-radius: 24px; background: linear-gradient(180deg, #151519, #050506); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
    .eyebrow { margin: 0 0 8px; color: #9c9cff; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0 0 10px; font-size: clamp(34px, 11vw, 58px); line-height: .92; }
    p { margin: 0; color: #b9b9c4; line-height: 1.45; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
    button, a.button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 12px 14px; border: 0; border-radius: 14px; background: #f4f4f5; color: #000; font-weight: 800; text-decoration: none; cursor: pointer; }
    button.secondary { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.14); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
    .filters { display: grid; gap: 12px; margin: 14px 0; padding: 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: rgba(255,255,255,.04); }
    .filter-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .filter-title h2 { margin: 0; font-size: 18px; }
    .chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
    .chip { flex: 0 0 auto; padding: 9px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #f6f6f6; font-weight: 700; }
    .chip.active { background: #f4f4f5; color: #000; }
    label { display: grid; gap: 6px; color: #b9b9c4; font-size: 13px; }
    input { width: 100%; padding: 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: #050506; color: #f6f6f6; }
    .stat, .card { border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: linear-gradient(180deg, rgba(18,18,22,.96), rgba(7,7,9,.96)); }
    .stat { padding: 13px; }
    .stat span { display: block; color: #858592; font-size: 12px; }
    .stat strong { display: block; margin-top: 5px; font-size: 20px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 20px 0 12px; }
    .toolbar h2 { margin: 0; font-size: 20px; }
    .feed-header { display: grid; grid-template-columns: 64px minmax(0, 1.35fr) .72fr .72fr .72fr 42px; align-items: center; gap: 10px; padding: 0 4px 10px; border-bottom: 1px solid rgba(255,255,255,.08); color: #ffd91f; font-weight: 800; }
    .feed-header span:first-child { grid-column: 1 / 3; color: #f6f6f6; }
    .list { display: grid; gap: 0; }
    .candidate-row { display: grid; grid-template-columns: 64px minmax(0, 1.35fr) .72fr .72fr .72fr 42px; align-items: center; gap: 10px; min-height: 86px; padding: 12px 4px; border-bottom: 1px solid rgba(255,255,255,.08); text-decoration: none; color: inherit; }
    .candidate-row:active { background: rgba(255,255,255,.04); }
    .nft-image { width: 64px; height: 64px; object-fit: contain; border-radius: 14px; background: radial-gradient(circle, rgba(255,255,255,.14), rgba(255,255,255,.03)); }
    .nft-fallback { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 14px; background: linear-gradient(135deg, #2b2b35, #0d0d10); color: #ffd91f; font-weight: 900; font-size: 22px; }
    .nft-title { display: block; overflow: hidden; color: #f8f8fb; font-weight: 900; font-size: 19px; line-height: 1.12; text-overflow: ellipsis; white-space: nowrap; }
    .nft-subtitle { display: block; margin-top: 4px; overflow: hidden; color: #8f8f9c; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
    .feed-value { overflow: hidden; color: #f8f8fb; font-weight: 900; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
    .price-value { color: #ffd91f; }
    .profit-value { color: #16d463; }
    .select-badge { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 13px; background: #ffd91f; color: #000; font-weight: 1000; font-size: 22px; }
    .card { padding: 16px; }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .pill { display: inline-flex; padding: 4px 9px; border-radius: 999px; background: rgba(156,156,255,.16); color: #c4c4ff; font-size: 11px; text-transform: uppercase; }
    .card h3 { margin: 0 0 8px; font-size: 20px; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
    .market-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .market-link { padding: 8px 10px; border-radius: 999px; color: #d7d7ff; background: rgba(156,156,255,.12); text-decoration: none; font-size: 12px; font-weight: 800; }
    .metric { padding: 10px; border-radius: 13px; background: rgba(255,255,255,.055); }
    .metric span { display: block; color: #8f8f9c; font-size: 12px; }
    .metric strong { display: block; margin-top: 3px; }
    .muted { color: #9696a3; }
    .error { color: #ff9f9f; }
    .empty { padding: 28px 16px; text-align: center; }
    @media (max-width: 560px) {
      .actions, .stats, .metrics { grid-template-columns: 1fr; }
      .feed-header { grid-template-columns: 58px minmax(0, 1.2fr) .7fr .7fr 42px; }
      .feed-header span:nth-child(4) { display: none; }
      .candidate-row { grid-template-columns: 58px minmax(0, 1.2fr) .7fr .7fr 42px; gap: 8px; }
      .candidate-row .feed-value:nth-of-type(4) { display: none; }
      .nft-image, .nft-fallback { width: 58px; height: 58px; }
      .nft-title { font-size: 18px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Telegram Mini App</p>
      <h1>WORKMKRT</h1>
      <p>Чёрный радар дешёвых MRKT-подарков, монохромных моделей и кандидатов для перепродажи.</p>
      <div class="actions">
        <button id="scanButton">Осторожный scan</button>
        <button class="secondary" id="refreshButton">Обновить</button>
      </div>
    </section>

    <section class="filters">
      <div class="filter-title">
        <h2>Что искать</h2>
        <span class="muted">до 100 TON</span>
      </div>
      <label>
        Макс. цена TON
        <input id="maxPriceInput" inputmode="decimal" value="100" />
      </label>
      <p class="muted">NFT</p>
      <div class="chips" id="collectionChips"></div>
      <p class="muted">Дорогие фоны</p>
      <div class="chips" id="backgroundChips"></div>
      <button class="secondary" id="savePreferencesButton">Сохранить выбор</button>
    </section>

    <section class="stats">
      <div class="stat"><span>Всего</span><strong id="totalCount">-</strong></div>
      <div class="stat"><span>Найдено</span><strong id="foundCount">-</strong></div>
      <div class="stat"><span>Отправлено</span><strong id="sentCount">-</strong></div>
    </section>

    <div class="toolbar">
      <h2>Кандидаты</h2>
      <span class="muted" id="updatedAt">загрузка</span>
    </div>
    <div class="feed-header">
      <span>Выбрать все</span>
      <span>Цена</span>
      <span>Флор</span>
      <span>Оборот</span>
      <span class="select-badge">✓</span>
    </div>
    <section class="list" id="candidateList"></section>
  </main>

  <script>
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    webApp?.setHeaderColor('#000000');
    webApp?.setBackgroundColor('#000000');

    const list = document.getElementById('candidateList');
    const totalCount = document.getElementById('totalCount');
    const foundCount = document.getElementById('foundCount');
    const sentCount = document.getElementById('sentCount');
    const updatedAt = document.getElementById('updatedAt');
    const scanButton = document.getElementById('scanButton');
    const refreshButton = document.getElementById('refreshButton');
    const savePreferencesButton = document.getElementById('savePreferencesButton');
    const maxPriceInput = document.getElementById('maxPriceInput');
    const collectionChips = document.getElementById('collectionChips');
    const backgroundChips = document.getElementById('backgroundChips');
    let scanPreferences = { collections: [], backgrounds: [], options: { collections: [], backgrounds: [] }, maxPrice: 100 };

    function formatTon(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(2).replace(/\.00$/, '') + ' TON' : '-';
    }

    function formatNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(number) : '-';
    }

    function formatShortDate(value) {
      const date = new Date(value || Date.now());
      return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function renderError(title, message) {
      list.innerHTML = '<article class="card empty"><strong class="error">' + escapeHtml(title) + '</strong><p>' + escapeHtml(message) + '</p></article>';
    }

    function getFriendlyError(error) {
      const message = String(error?.message || error || 'Ошибка');

      if (message.includes('initData') || message.includes('hash')) {
        return 'Открой Mini App через кнопку в Telegram-боте. В браузере доступ к данным отключен.';
      }

      if (message.includes('not allowed') || message.includes('whitelist')) {
        return 'Твой Telegram ID не добавлен в whitelist. Добавь его в ALLOWED_TELEGRAM_USER_IDS на Render.';
      }

      return message;
    }

    function renderCandidates(candidates) {
      totalCount.textContent = candidates.length;
      foundCount.textContent = candidates.filter((candidate) => candidate.status === 'found').length;
      sentCount.textContent = candidates.filter((candidate) => candidate.status === 'sent').length;
      updatedAt.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      const visible = candidates.filter((candidate) => candidate.status !== 'viewed').slice(0, 30);

      if (visible.length === 0) {
        list.innerHTML = '<article class="card empty"><strong>Пока нет кандидатов</strong><p>Запусти scan или дождись автоматического мониторинга.</p></article>';
        return;
      }

      list.innerHTML = visible.map((candidate) => {
        const href = candidate.url || '#';
        const image = candidate.photoUrl
          ? '<img class="nft-image" src="' + escapeHtml(candidate.photoUrl) + '" alt="" loading="lazy" />'
          : '<div class="nft-fallback">' + escapeHtml(String(candidate.title || '?').slice(0, 1)) + '</div>';
        const floor = Number.isFinite(Number(candidate.modelFloor)) ? candidate.modelFloor : candidate.resaleEstimate || candidate.collectionFloor;
        const turnover = candidate.salesCount ?? candidate.resaleRatio ?? candidate.resaleSpread;
        const profitClass = Number(candidate.resaleSpread) > 0 ? ' profit-value' : '';

        return '<a class="candidate-row" target="_blank" rel="noreferrer" href="' + escapeHtml(href) + '">'
          + image
          + '<span><strong class="nft-title">' + escapeHtml(candidate.title || 'MRKT Gift') + '</strong><span class="nft-subtitle">' + escapeHtml(formatShortDate(candidate.lastSeenAt)) + ' · ' + escapeHtml(candidate.background || '-') + '</span></span>'
          + '<span class="feed-value price-value">◆ ' + escapeHtml(formatTon(candidate.price)) + '</span>'
          + '<span class="feed-value' + profitClass + '">◆ ' + escapeHtml(formatTon(floor)) + '</span>'
          + '<span class="feed-value">◆ ' + escapeHtml(formatNumber(turnover)) + '</span>'
          + '<span class="select-badge">✓</span>'
          + '</a>';
      }).join('');
    }

    function renderChips(container, options, selected) {
      container.innerHTML = options.map((option) => {
        const active = selected.includes(option) ? ' active' : '';
        return '<button class="chip' + active + '" type="button" data-value="' + escapeHtml(option) + '">' + escapeHtml(option) + '</button>';
      }).join('');
    }

    function getSelected(container) {
      return [...container.querySelectorAll('.chip.active')].map((chip) => chip.dataset.value);
    }

    async function loadPreferences() {
      const response = await fetch('/api/scan/preferences', { cache: 'no-store', headers: telegramHeaders() });
      const payload = await response.json();
      scanPreferences = payload.preferences;
      maxPriceInput.value = scanPreferences.maxPrice || 100;
      renderChips(collectionChips, scanPreferences.options.collections, scanPreferences.collections);
      renderChips(backgroundChips, scanPreferences.options.backgrounds, scanPreferences.backgrounds);
    }

    function toggleChip(event) {
      const chip = event.target.closest('.chip');

      if (!chip) {
        return;
      }

      chip.classList.toggle('active');
    }

    async function loadCandidates() {
      try {
        updatedAt.textContent = 'загрузка';
        const response = await fetch('/api/alerts/candidates', { cache: 'no-store', headers: telegramHeaders() });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Не удалось загрузить кандидатов');
        }

        renderCandidates(payload.candidates || []);
      } catch (error) {
        renderError('Ошибка', getFriendlyError(error));
      }
    }

    scanButton.addEventListener('click', async () => {
      scanButton.disabled = true;
      scanButton.textContent = 'Сканирую...';

      try {
        await savePreferences();
        const response = await fetch('/api/alerts/scan', { method: 'POST', headers: telegramHeaders() });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Scan failed');
        }

        await loadCandidates();
      } catch (error) {
        renderError('Scan не запущен', getFriendlyError(error));
      } finally {
        scanButton.disabled = false;
        scanButton.textContent = 'Осторожный scan';
      }
    });

    refreshButton.addEventListener('click', loadCandidates);
    collectionChips.addEventListener('click', toggleChip);
    backgroundChips.addEventListener('click', toggleChip);

    async function savePreferences() {
      const response = await fetch('/api/scan/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...telegramHeaders() },
        body: JSON.stringify({
          maxPrice: Number(maxPriceInput.value || 100),
          collections: getSelected(collectionChips),
          backgrounds: getSelected(backgroundChips)
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось сохранить настройки');
      }

      scanPreferences = payload.preferences;
    }

    savePreferencesButton.addEventListener('click', async () => {
      savePreferencesButton.disabled = true;
      savePreferencesButton.textContent = 'Сохраняю...';

      try {
        await savePreferences();
        savePreferencesButton.textContent = 'Сохранено';
        setTimeout(() => { savePreferencesButton.textContent = 'Сохранить выбор'; }, 1200);
      } catch (error) {
        renderError('Ошибка настроек', getFriendlyError(error));
        savePreferencesButton.textContent = 'Сохранить выбор';
      } finally {
        savePreferencesButton.disabled = false;
      }
    });

    loadPreferences().then(loadCandidates).catch(loadCandidates);
    setInterval(loadCandidates, 60000);

    function telegramHeaders() {
      const initData = webApp?.initData;

      return initData ? { 'x-telegram-init-data': initData } : {};
    }
  </script>
</body>
</html>`;
}

app.get("/", (_req, res) => {
  res.redirect("/miniapp");
});

app.get("/miniapp", (_req, res) => {
  res.type("html").send(renderMiniAppHtml());
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mrkt-api" });
});

app.get("/telegram/status", (_req, res) => {
  res.json({ telegram: getTelegramStatus(), bot: getBotStatus(), access: getTelegramAccessStatus() });
});

app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body);
    return res.json({ ok: true });
  } catch (error) {
    console.error(`Telegram webhook failed: ${error.message || error}`);
    return res.status(200).json({ ok: false });
  }
});

app.get("/telegram/account", async (_req, res) => {
  try {
    const account = await getTelegramAccount();
    return res.json({ account });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Telegram account check failed" });
  }
});

app.post("/monitor/run", async (_req, res) => {
  try {
    const result = await runMarketAlertScanSafely({ manual: true });
    return res.json({ result });
  } catch (error) {
    const message = error.message || "Market alert scan failed";
    const status = message.includes("cooldown") ? 429 : 400;
    return res.status(status).json({ error: message });
  }
});

app.get("/api/alerts/candidates", requireMiniAppAccess, async (_req, res) => {
  try {
    return res.json(await getAlertDashboardData());
  } catch (error) {
    return res.status(400).json({ error: error.message || "Candidates fetch failed" });
  }
});

app.get("/api/scan/preferences", requireMiniAppAccess, (_req, res) => {
  res.json({ preferences: getScanPreferences() });
});

app.patch("/api/scan/preferences", requireMiniAppAccess, (req, res) => {
  try {
    return res.json({ preferences: updateScanPreferences(req.body) });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Scan preferences update failed" });
  }
});

app.post("/api/alerts/scan", requireMiniAppAccess, async (_req, res) => {
  try {
    const result = await runMarketAlertScanSafely({ manual: true });
    return res.json({ result });
  } catch (error) {
    const message = error.message || "Market alert scan failed";
    const status = message.includes("cooldown") ? 429 : 400;
    return res.status(status).json({ error: message });
  }
});

app.patch("/api/alerts/candidates/:externalItemId", requireMiniAppAccess, async (req, res) => {
  const status = req.body?.status;

  if (!["found", "sent", "viewed"].includes(status)) {
    return res.status(400).json({ error: "status must be found, sent or viewed" });
  }

  try {
    const candidate = await updateAlertCandidateStatus(req.params.externalItemId, status);

    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    return res.json({ candidate });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Candidate update failed" });
  }
});

app.post("/auth/telegram", (req, res) => {
  const { telegramId, username, firstName } = req.body ?? {};

  if (!telegramId) {
    return res.status(400).json({ error: "telegramId is required" });
  }

  let user = users.find((entry) => entry.telegramId === telegramId);

  if (!user) {
    user = {
      id: users.length + 1,
      telegramId,
      username: username ?? null,
      firstName: firstName ?? "User"
    };

    users.push(user);
  }

  return res.json({ user });
});

app.get("/me", (_req, res) => {
  res.json({ user: users[0] });
});

app.get("/rules", (_req, res) => {
  res.json({ rules });
});

app.post("/rules", (req, res) => {
  const payload = req.body ?? {};
  const rule = {
    id: rules.length + 1,
    userId: 1,
    enabled: Boolean(payload.enabled ?? true),
    maxPrice: Number(payload.maxPrice ?? 0),
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    attributes: Array.isArray(payload.attributes) ? payload.attributes : [],
    autoBuy: Boolean(payload.autoBuy),
    dailyLimit: Number(payload.dailyLimit ?? 1),
    createdAt: new Date().toISOString()
  };

  rules.push(rule);
  res.status(201).json({ rule });
});

app.patch("/rules/:id", (req, res) => {
  const ruleId = Number(req.params.id);
  const rule = rules.find((entry) => entry.id === ruleId);

  if (!rule) {
    return res.status(404).json({ error: "Rule not found" });
  }

  Object.assign(rule, req.body ?? {});
  return res.json({ rule });
});

app.get("/items", (_req, res) => {
  res.json({ items });
});

app.get("/purchases", (_req, res) => {
  res.json({ purchases });
});

app.post("/autobuy/toggle", (req, res) => {
  const { ruleId, autoBuy } = req.body ?? {};
  const rule = rules.find((entry) => entry.id === Number(ruleId));

  if (!rule) {
    return res.status(404).json({ error: "Rule not found" });
  }

  rule.autoBuy = Boolean(autoBuy);
  return res.json({ rule });
});

app.listen(port, () => {
  console.log(`MRKT API listening on port ${port}`);

  if (process.env.TELEGRAM_AUTO_SETUP === "true") {
    setupTelegramBot()
      .then((result) => {
        console.log(`Telegram webhook configured: ${result.webhookUrl}`);
      })
      .catch((error) => {
        console.error(`Telegram setup failed: ${error.message || error}`);
      });
  }
});
