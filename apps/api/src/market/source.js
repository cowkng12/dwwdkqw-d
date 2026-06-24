import { items } from "../data/store.js";
import { fetchMrktSalingGifts } from "./mrkt-api.js";

function normalizeMarketItem(item, index) {
  const gift = item.gift ?? item;
  const title = gift.name ?? gift.title ?? gift.collectionTitle ?? `MRKT item #${index + 1}`;
  const numberFromName = typeof gift.name === "string" ? gift.name.match(/-(\d+)$/)?.[1] : null;
  const number = gift.number ?? gift.giftNumber ?? gift.num ?? gift.gift_num ?? gift.giftNum ?? numberFromName ?? null;
  const background = gift.background ?? gift.bg ?? gift.backdrop ?? gift.backdropName ?? gift.backdropTitle ?? gift.backdrop?.name ?? null;
  const model = gift.model ?? gift.modelName ?? gift.giftModel ?? gift.modelTitle ?? gift.model?.name ?? null;
  const color = gift.color ?? gift.giftColor ?? gift.mainColor ?? model;
  const collection = gift.collection ?? gift.collectionName ?? gift.collectionTitle ?? gift.collection?.name ?? title ?? "Unknown";
  const startApp = gift.startApp ?? gift.startapp ?? gift.startAppPayload ?? gift.slug ?? gift.id ?? item.id ?? null;
  const url = gift.url ?? gift.link ?? item.url ?? item.link ?? (startApp ? `https://t.me/mrkt/app?startapp=${startApp}` : null);
  const nanoPrice = gift.salePrice ?? gift.salePriceWithoutFee ?? gift.priceNano ?? null;
  const price = nanoPrice ? Number(nanoPrice) / 1_000_000_000 : Number(gift.price ?? item.price ?? item.amount ?? 0);
  const collectionFloorNano = gift.floorPriceNanoTONsByCollection ?? item.floorPriceNanoTONsByCollection ?? null;
  const backdropModelFloorNano = gift.floorPriceNanoTONsByBackdropModel ?? item.floorPriceNanoTONsByBackdropModel ?? null;

  return {
    id: gift.id ?? item.id ?? index + 1,
    externalItemId: String(gift.externalItemId ?? gift.id ?? item.id ?? gift.slug ?? `market-${index + 1}`),
    collection,
    title,
    number,
    background,
    model,
    color,
    price,
    currency: gift.currency ?? item.currency ?? "TON",
    status: gift.status ?? item.status ?? "new",
    url,
    modelStickerThumbnailKey: gift.modelStickerThumbnailKey ?? item.modelStickerThumbnailKey ?? null,
    backdropColors: {
      center: gift.backdropColorsCenterColor ?? item.backdropColorsCenterColor ?? null,
      edge: gift.backdropColorsEdgeColor ?? item.backdropColorsEdgeColor ?? null
    },
    resale: {
      collectionFloor: collectionFloorNano ? Number(collectionFloorNano) / 1_000_000_000 : null,
      backdropModelFloor: backdropModelFloorNano ? Number(backdropModelFloorNano) / 1_000_000_000 : null,
      salesCount: gift.salesCount ?? item.salesCount ?? null
    },
    firstSeenAt: gift.firstSeenAt ?? item.firstSeenAt ?? new Date().toISOString()
  };
}

export async function fetchMarketItems() {
  if (process.env.MRKT_AUTH_TOKEN || process.env.TELEGRAM_SESSION) {
    const gifts = await fetchMrktSalingGifts();
    return gifts.map(normalizeMarketItem);
  }

  if (!process.env.MARKET_SOURCE_URL) {
    if (process.env.DEMO_MARKET_ENABLED !== "true") {
      throw new Error("MARKET_SOURCE_URL is required for real MRKT monitoring. Set DEMO_MARKET_ENABLED=true only for test alerts");
    }

    return items;
  }

  const response = await fetch(process.env.MARKET_SOURCE_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Market source request failed: ${response.status}`);
  }

  const payload = await response.json();
  const list = Array.isArray(payload) ? payload : payload.items ?? payload.results ?? [];

  if (!Array.isArray(list)) {
    throw new Error("Market source response must be an array or contain items/results array");
  }

  return list.map(normalizeMarketItem);
}
