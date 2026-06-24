import "dotenv/config";
import { fetchMrktRawGifts } from "../src/market/mrkt-api.js";

async function main() {
  const gifts = await fetchMrktRawGifts();

  console.log(`Fetched: ${gifts.length}`);

  for (const gift of gifts.slice(0, 10)) {
    console.log("---");
    console.log({
      id: gift.id,
      number: gift.number ?? gift.giftNum ?? gift.giftNumber,
      collectionTitle: gift.collectionTitle,
      modelName: gift.modelName,
      backdropName: gift.backdropName,
      symbolTitle: gift.symbolTitle,
      salePrice: gift.salePrice,
      salePriceTon: gift.salePrice ? Number(gift.salePrice) / 1_000_000_000 : undefined,
      link: gift.link,
      slug: gift.slug
    });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
