import "dotenv/config";
import { fetchMrktRawGifts } from "../src/market/mrkt-api.js";

async function main() {
  const gifts = await fetchMrktRawGifts();
  const gift = gifts[0];

  if (!gift) {
    console.log("No gifts returned");
    return;
  }

  console.log("Top-level keys:", Object.keys(gift));
  console.dir(gift, { depth: 10 });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
