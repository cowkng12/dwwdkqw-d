import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultTargetCollections = [
  "Heroic Helmet",
  "Heart Locket",
  "Xmas Stocking",
  "Instant Ramen",
  "Lol Pop",
  "B-Day Candle",
  "Plush Pepe",
  "Precious Peach",
  "Durov's Cap",
  "Toy Bear",
  "Neko Helmet",
  "Loot Bag"
];

export const defaultTargetBackgrounds = [
  "Black",
  "White",
  "Platinum",
  "Silver",
  "Electric Purple",
  "Cyberpunk",
  "Electric Indigo",
  "Neon Blue",
  "Azure Blue",
  "Sapphire",
  "Sky Blue",
  "Mint Green",
  "Emerald",
  "Malachite",
  "Aquamarine",
  "Pacific Green",
  "Lavender",
  "Purple",
  "Violet",
  "Gold",
  "Pure Gold",
  "Satin Gold",
  "Ruby",
  "Crimson",
  "Fuchsia",
  "Magenta"
];

const initialCollections = splitEnvList(process.env.MRKT_TARGET_COLLECTIONS);
const initialBackgrounds = splitEnvList(process.env.MRKT_TARGET_BACKGROUNDS);
const initialMaxPrice = Number(process.env.MONOCHROME_MAX_PRICE ?? 100);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const preferencesPath = process.env.SCAN_PREFERENCES_PATH
  ? path.resolve(process.env.SCAN_PREFERENCES_PATH)
  : path.resolve(moduleDir, "../../.data/scan-preferences.json");

const scanPreferences = {
  maxPrice: Number.isFinite(initialMaxPrice) && initialMaxPrice > 0 ? initialMaxPrice : 100,
  collections: initialCollections.length > 0 ? initialCollections : defaultTargetCollections,
  backgrounds: initialBackgrounds.length > 0 ? initialBackgrounds : defaultTargetBackgrounds,
  externalMarkets: {
    tonnel: "https://t.me/Tonnel_Network_bot",
    portals: "https://t.me/portals",
    quant: null
  }
};

loadPersistedPreferences();

function splitEnvList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function loadPersistedPreferences() {
  try {
    const parsed = JSON.parse(readFileSync(preferencesPath, "utf8"));

    if (Number.isFinite(Number(parsed.maxPrice)) && Number(parsed.maxPrice) > 0) {
      scanPreferences.maxPrice = Number(parsed.maxPrice);
    }

    if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
      scanPreferences.collections = uniqueList(parsed.collections);
    }

    if (Array.isArray(parsed.backgrounds) && parsed.backgrounds.length > 0) {
      scanPreferences.backgrounds = uniqueList(parsed.backgrounds);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Scan preferences load failed: ${error.message || error}`);
    }
  }
}

function savePersistedPreferences() {
  mkdirSync(path.dirname(preferencesPath), { recursive: true });
  writeFileSync(preferencesPath, `${JSON.stringify({
    maxPrice: scanPreferences.maxPrice,
    collections: scanPreferences.collections,
    backgrounds: scanPreferences.backgrounds
  }, null, 2)}\n`);
}

export function getScanPreferences() {
  return {
    maxPrice: scanPreferences.maxPrice,
    collections: scanPreferences.collections,
    backgrounds: scanPreferences.backgrounds,
    externalMarkets: {
      ...scanPreferences.externalMarkets,
      tonnel: process.env.TONNEL_MARKET_URL || scanPreferences.externalMarkets.tonnel,
      portals: process.env.PORTALS_MARKET_URL || scanPreferences.externalMarkets.portals,
      quant: process.env.QUANT_MARKET_URL || scanPreferences.externalMarkets.quant
    },
    options: {
      collections: defaultTargetCollections,
      backgrounds: defaultTargetBackgrounds
    }
  };
}

export function updateScanPreferences(payload = {}) {
  if (Number.isFinite(Number(payload.maxPrice)) && Number(payload.maxPrice) > 0) {
    scanPreferences.maxPrice = Number(payload.maxPrice);
  }

  if (Array.isArray(payload.collections) && payload.collections.length > 0) {
    scanPreferences.collections = uniqueList(payload.collections);
  }

  if (Array.isArray(payload.backgrounds) && payload.backgrounds.length > 0) {
    scanPreferences.backgrounds = uniqueList(payload.backgrounds);
  }

  savePersistedPreferences();

  return getScanPreferences();
}

export function createExternalMarketLinks(item) {
  const preferences = getScanPreferences();
  const query = encodeURIComponent([item.collection, item.model, item.background].filter(Boolean).join(" "));

  return {
    tonnel: preferences.externalMarkets.tonnel,
    portals: preferences.externalMarkets.portals ? `${preferences.externalMarkets.portals}?q=${query}` : null,
    quant: preferences.externalMarkets.quant ? `${preferences.externalMarkets.quant}?q=${query}` : null
  };
}
