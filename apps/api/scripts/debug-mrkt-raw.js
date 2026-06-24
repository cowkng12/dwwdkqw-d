import "dotenv/config";
import { fetchMrktRawPayload } from "../src/market/mrkt-api.js";

async function main() {
  const payload = await fetchMrktRawPayload();
  const gifts = Array.isArray(payload.gifts) ? payload.gifts : [];

  console.log(`Raw fetched: ${gifts.length}`);
  console.log("Payload keys:", Object.keys(payload));
  console.dir(payload, { depth: 8 });

  for (const gift of gifts.slice(0, 5)) {
    console.log("---");
    console.dir(gift, { depth: 6 });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
