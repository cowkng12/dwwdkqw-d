import "dotenv/config";
import cors from "cors";
import express from "express";
import { items, purchases, rules, users } from "./data/store.js";
import { getTelegramStatus } from "./telegram/config.js";
import { getTelegramAccount } from "./telegram/client.js";
import { getBotStatus, handleTelegramWebhook, setupTelegramBot } from "./telegram/bot.js";
import { getAlertDashboardData, runMarketAlertScanSafely } from "./monitor/alerts.js";
import { updateAlertCandidateStatus } from "./monitor/candidates-store.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mrkt-api" });
});

app.get("/telegram/status", (_req, res) => {
  res.json({ telegram: getTelegramStatus(), bot: getBotStatus() });
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

app.get("/api/alerts/candidates", async (_req, res) => {
  try {
    return res.json(await getAlertDashboardData());
  } catch (error) {
    return res.status(400).json({ error: error.message || "Candidates fetch failed" });
  }
});

app.post("/api/alerts/scan", async (_req, res) => {
  try {
    const result = await runMarketAlertScanSafely({ manual: true });
    return res.json({ result });
  } catch (error) {
    const message = error.message || "Market alert scan failed";
    const status = message.includes("cooldown") ? 429 : 400;
    return res.status(status).json({ error: message });
  }
});

app.patch("/api/alerts/candidates/:externalItemId", async (req, res) => {
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
