import "dotenv/config";
import { runMarketAlertScan } from "../src/monitor/alerts.js";
import { ignoreGramJsTimeout } from "./ignore-gramjs-timeout.js";

ignoreGramJsTimeout();

async function main() {
  const result = await runMarketAlertScan();

  console.log(`Scanned: ${result.scanned}`);
  console.log(`Notified: ${result.notified}`);

  for (const { item } of result.matches) {
    console.log(`${item.title} | ${item.collection} | ${item.background} | ${item.model} | ${item.price} ${item.currency} | ${item.url}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
