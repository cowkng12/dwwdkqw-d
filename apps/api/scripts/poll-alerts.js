import "dotenv/config";
import { runMarketAlertScan } from "../src/monitor/alerts.js";
import { ignoreGramJsTimeout } from "./ignore-gramjs-timeout.js";

const pollIntervalMs = Number(process.env.MARKET_ALERT_POLL_MS ?? 300000);
const bannedCooldownMs = Number(process.env.MRKT_BANNED_COOLDOWN_MS ?? 300000);

ignoreGramJsTimeout();

function isTransientFetchError(error) {
  return String(error?.message ?? error).includes("fetch failed");
}

async function scan() {
  console.log(`${new Date().toISOString()} scan started`);
  try {
    const result = await runMarketAlertScan();
    console.log(`${new Date().toISOString()} scanned=${result.scanned} notified=${result.notified}`);
  } catch (error) {
    if (String(error?.message ?? error).includes("MRKT API temporarily banned requests")) {
      console.error(`${new Date().toISOString()} MRKT cooldown ${Math.round(bannedCooldownMs / 1000)}s: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, bannedCooldownMs));
      return;
    }

    if (isTransientFetchError(error)) {
      console.error(`${new Date().toISOString()} transient fetch error, next scan will retry: ${error.message}`);
      return;
    }

    throw error;
  }
}

async function main() {
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 60000) {
    throw new Error("MARKET_ALERT_POLL_MS must be at least 60000");
  }

  while (true) {
    const scanStartedAt = Date.now();

    await scan().catch((error) => {
      console.error(`${new Date().toISOString()} scan failed, next scan will retry: ${error.message || error}`);
    });

    const waitMs = Math.max(0, pollIntervalMs - (Date.now() - scanStartedAt));
    console.log(`${new Date().toISOString()} next scan in ${Math.round(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
