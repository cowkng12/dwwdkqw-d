import "dotenv/config";
import { fetchMarketItems } from "../src/market/source.js";
import { getPremiumBackground } from "../src/monitor/backgrounds.js";

async function main() {
  const items = await fetchMarketItems();

  console.log(`Fetched: ${items.length}`);

  for (const item of items.slice(0, 20)) {
    const premiumBackground = getPremiumBackground(item.background);

    console.log("---");
    console.log(`Title: ${item.title}`);
    console.log(`Number: ${item.number ?? "n/a"}`);
    console.log(`Collection: ${item.collection}`);
    console.log(`Background: ${item.background ?? "n/a"}`);
    console.log(`Background priority: ${premiumBackground?.score ?? "n/a"}`);
    console.log(`Model: ${item.model ?? "n/a"}`);
    console.log(`Color: ${item.color ?? "n/a"}`);
    console.log(`Price: ${item.price} ${item.currency}`);
    console.log(`URL: ${item.url ?? "n/a"}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
