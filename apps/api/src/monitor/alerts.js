import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { rules } from "../data/store.js";
import { fetchCollectionFloorPrice, fetchModelFloorPrice } from "../market/mrkt-api.js";
import { createExternalMarketLinks, getScanPreferences } from "../market/scan-config.js";
import { fetchMarketItems } from "../market/source.js";
import { sendTelegramAlert } from "../telegram/bot.js";
import { getPremiumBackground, normalizeBackgroundName } from "./backgrounds.js";
import { listAlertCandidates, upsertAlertCandidate } from "./candidates-store.js";

const notifiedItemIds = new Set();
const modelColorCache = new Map();
const modelImageCache = new Map();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const notifiedItemsPath = process.env.MARKET_ALERT_NOTIFIED_PATH
  ? path.resolve(process.env.MARKET_ALERT_NOTIFIED_PATH)
  : path.resolve(moduleDir, "../../.data/notified-items.json");
let notifiedItemIdsLoaded = false;
let scanInFlight = null;
let lastScanAt = 0;
let bannedUntil = 0;

function isDryRun() {
  return process.env.MARKET_ALERT_DRY_RUN === "true";
}

const monochromeColorFamilies = [
  {
    backgrounds: ["black"],
    models: ["black", "midnight", "onyx", "coal", "shadow", "night", "noir", "nightmirror", "negativ", "negative", "photo", "gothic", "pasta"]
  },
  {
    backgrounds: ["white", "platinum", "silver", "gray", "grey", "feldgrau", "steel", "battleship"],
    models: ["white", "platinum", "silver", "gray", "grey", "vanilla", "ivory", "snow", "pearl", "chrome", "steel", "arctic", "outline", "ghost", "frost"]
  },
  {
    backgrounds: ["purple", "lavender", "indigo", "lilac", "violet", "fandango", "cyberpunk"],
    models: ["purple", "lavender", "indigo", "violet", "fuchsia", "magenta", "ube", "grape", "lilac", "berry", "plum", "toxic", "fandango"]
  },
  {
    backgrounds: ["blue", "sapphire", "cyan", "aquamarine", "turquoise", "moonstone", "teal", "maya", "cobalt", "azure", "neon", "pacific"],
    models: ["blue", "midnight", "sapphire", "azure", "cyan", "aqua", "aquamarine", "turquoise", "teal", "ocean", "marine", "navy", "cobalt", "bubble", "blizzard", "jellyfish", "deep", "celtic"]
  },
  {
    backgrounds: ["green", "emerald", "mint", "malachite", "shamrock", "lemongrass", "rifle", "khaki", "pine", "hunter", "jade", "lime", "forest", "olive", "pistachio"],
    models: ["green", "emerald", "mint", "malachite", "shamrock", "lemongrass", "lime", "forest", "olive", "jade", "pistachio", "cucumber", "cosmic", "swamp", "lychee", "broccoli", "dragon"]
  },
  {
    backgrounds: ["yellow", "gold", "amber", "mustard"],
    models: ["yellow", "gold", "golden", "amber", "mustard", "honey", "lemon", "fresh", "sun", "mango"]
  },
  {
    backgrounds: ["orange", "carrot", "sienna"],
    models: ["orange", "carrot", "sienna", "tangerine", "copper", "dusk", "mango", "sunset", "broth", "shrimp"]
  },
  {
    backgrounds: ["red", "burgundy", "coral", "sienna", "rosewood", "ruby", "crimson"],
    models: ["red", "ruby", "crimson", "coral", "burgundy", "scarlet", "cherry", "spicy", "beef"]
  },
  {
    backgrounds: ["pink", "rose", "magenta", "fuchsia", "raspberry", "mauve"],
    models: ["pink", "rose", "magenta", "fuchsia", "raspberry", "bubblegum", "mauve", "faerie", "flamingo"]
  },
  {
    backgrounds: ["brown", "chocolate", "chestnut", "caramel", "cappuccino", "bronze", "copper", "beige", "sand"],
    models: ["brown", "chocolate", "cappuccino", "caramel", "chestnut", "bronze", "copper", "beige", "sand", "toffee", "cookie", "choco", "coffee", "privet", "vintage", "abandoned", "ramen", "snack", "pack"]
  }
];

function getMaxAlertPrice() {
  const value = Number(getScanPreferences().maxPrice ?? 100);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

function getMaxAlertsPerScan() {
  const value = Number(process.env.MARKET_ALERT_MAX_PER_SCAN ?? 3);
  return Number.isInteger(value) && value > 0 ? value : 3;
}

function getSafeScanCooldownMs() {
  const rawValue = Number(process.env.MARKET_ALERT_SCAN_COOLDOWN_MS ?? process.env.MARKET_ALERT_POLL_MS ?? 300000);
  return Number.isFinite(rawValue) && rawValue >= 60000 ? rawValue : 300000;
}

function getBannedCooldownMs() {
  const value = Number(process.env.MRKT_BANNED_COOLDOWN_MS ?? 300000);
  return Number.isFinite(value) && value >= 60000 ? value : 300000;
}

function shouldRequireMonochrome() {
  return process.env.MARKET_ALERT_REQUIRE_MONOCHROME !== "false";
}

function shouldRequireModelBackdropMatch() {
  return process.env.MARKET_ALERT_REQUIRE_MODEL_BACKDROP_MATCH === "true";
}

function getMinModelBackdropMatchShare() {
  const value = Number(process.env.MARKET_ALERT_MIN_MODEL_BACKDROP_MATCH_SHARE ?? 0.42);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.42;
}

function getMinModelBackdropTotalShare() {
  const value = Number(process.env.MARKET_ALERT_MIN_MODEL_BACKDROP_TOTAL_SHARE ?? 0.35);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.35;
}

function getMinSingleColorDominantShare() {
  const value = Number(process.env.MARKET_ALERT_MIN_SINGLE_COLOR_DOMINANT_SHARE ?? 0.76);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.76;
}

function getMinNeutralModelShare() {
  const value = Number(process.env.MARKET_ALERT_MIN_NEUTRAL_MODEL_SHARE ?? 0.78);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.78;
}

function getMaxAccentShare() {
  const value = Number(process.env.MARKET_ALERT_MAX_ACCENT_SHARE ?? 0.18);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.18;
}

function getMaxModelBackdropHueDistance() {
  const value = Number(process.env.MARKET_ALERT_MAX_MODEL_BACKDROP_HUE_DISTANCE ?? 28);
  return Number.isFinite(value) && value > 0 ? value : 28;
}

function getDominantHueBucketSize() {
  const value = Number(process.env.MARKET_ALERT_DOMINANT_HUE_BUCKET_SIZE ?? 18);
  return Number.isFinite(value) && value > 0 ? value : 18;
}

function getMonochromeDebugLimit() {
  const value = Number(process.env.MARKET_ALERT_MONOCHROME_DEBUG_LIMIT ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function getResaleDebugLimit() {
  const value = Number(process.env.MARKET_ALERT_RESALE_DEBUG_LIMIT ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function shouldAllowTextMonochromeFallback() {
  return process.env.MARKET_ALERT_ALLOW_TEXT_MONOCHROME_FALLBACK !== "false";
}

function shouldPreferTextMonochromeMatch() {
  return process.env.MRKT_SCAN_BY_BACKDROP === "true";
}

function shouldNotifyFoundMonochrome() {
  return process.env.MARKET_ALERT_NOTIFY_FOUND_MONOCHROME === "true";
}

function matchesRule(item, rule) {
  if (!rule.enabled) {
    return false;
  }

  if (Number(item.price) > getMaxAlertPrice()) {
    return false;
  }

  if (rule.collections.length > 0 && !rule.collections.includes(item.collection)) {
    return false;
  }

  return true;
}

async function loadNotifiedItemIds() {
  if (notifiedItemIdsLoaded) {
    return;
  }

  try {
    const raw = await readFile(notifiedItemsPath, "utf8");
    const ids = JSON.parse(raw);

    if (Array.isArray(ids)) {
      for (const id of ids) {
        notifiedItemIds.add(String(id));
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  notifiedItemIdsLoaded = true;
}

async function saveNotifiedItemIds() {
  await mkdir(path.dirname(notifiedItemsPath), { recursive: true });
  await writeFile(notifiedItemsPath, `${JSON.stringify([...notifiedItemIds], null, 2)}\n`);
}

function includesAnyWord(value, words) {
  const tokens = String(value ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/[^a-zа-я0-9]+/)
    .filter(Boolean);

  return words.some((word) => tokens.includes(normalizeBackgroundName(word)));
}

function intToRgb(value) {
  const color = Number(value);

  if (!Number.isInteger(color) || color < 0) {
    return null;
  }

  return {
    red: (color >> 16) & 255,
    green: (color >> 8) & 255,
    blue: color & 255
  };
}

function rgbToHex({ red, green, blue }) {
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function getFallbackBackdropColors(background) {
  const name = normalizeBackgroundName(background);
  const colors = {
    black: [{ red: 28, green: 28, blue: 32 }, { red: 7, green: 7, blue: 9 }],
    white: [{ red: 245, green: 245, blue: 238 }, { red: 218, green: 218, blue: 210 }],
    platinum: [{ red: 226, green: 229, blue: 226 }, { red: 180, green: 187, blue: 188 }],
    silver: [{ red: 207, green: 213, blue: 218 }, { red: 150, green: 160, blue: 170 }],
    gray: [{ red: 130, green: 136, blue: 142 }, { red: 82, green: 88, blue: 96 }],
    grey: [{ red: 130, green: 136, blue: 142 }, { red: 82, green: 88, blue: 96 }],
    gold: [{ red: 235, green: 174, blue: 48 }, { red: 178, green: 116, blue: 24 }],
    puregold: [{ red: 246, green: 197, blue: 48 }, { red: 194, green: 126, blue: 21 }],
    satingold: [{ red: 224, green: 170, blue: 71 }, { red: 159, green: 105, blue: 40 }],
    red: [{ red: 228, green: 62, blue: 62 }, { red: 134, green: 24, blue: 32 }],
    coralred: [{ red: 239, green: 98, blue: 83 }, { red: 167, green: 45, blue: 47 }],
    purple: [{ red: 137, green: 78, blue: 214 }, { red: 74, green: 39, blue: 143 }],
    electricpurple: [{ red: 161, green: 62, blue: 242 }, { red: 81, green: 26, blue: 177 }],
    cyberpunk: [{ red: 223, green: 42, blue: 215 }, { red: 36, green: 91, blue: 224 }],
    electricindigo: [{ red: 101, green: 62, blue: 245 }, { red: 42, green: 40, blue: 157 }],
    lavender: [{ red: 186, green: 146, blue: 226 }, { red: 123, green: 88, blue: 176 }],
    neonblue: [{ red: 29, green: 138, blue: 246 }, { red: 19, green: 72, blue: 189 }],
    azureblue: [{ red: 47, green: 153, blue: 231 }, { red: 25, green: 85, blue: 169 }],
    skyblue: [{ red: 86, green: 184, blue: 241 }, { red: 45, green: 119, blue: 194 }],
    sapphire: [{ red: 39, green: 105, blue: 199 }, { red: 19, green: 54, blue: 138 }],
    mintgreen: [{ red: 71, green: 218, blue: 166 }, { red: 32, green: 142, blue: 106 }],
    emerald: [{ red: 30, green: 184, blue: 112 }, { red: 12, green: 112, blue: 75 }],
    malachite: [{ red: 20, green: 199, blue: 100 }, { red: 12, green: 125, blue: 63 }],
    aquamarine: [{ red: 72, green: 214, blue: 202 }, { red: 23, green: 136, blue: 148 }],
    turquoise: [{ red: 45, green: 191, blue: 198 }, { red: 23, green: 116, blue: 145 }]
  };

  return colors[name] ?? [{ red: 197, green: 128, blue: 47 }, { red: 151, green: 89, blue: 31 }];
}

async function getModelImageBuffer(item) {
  if (!item.modelStickerThumbnailKey) {
    return null;
  }

  if (modelImageCache.has(item.modelStickerThumbnailKey)) {
    return modelImageCache.get(item.modelStickerThumbnailKey);
  }

  let response;

  try {
    response = await fetch(`https://cdn.tgmrkt.io/${item.modelStickerThumbnailKey}`);
  } catch (_error) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  modelImageCache.set(item.modelStickerThumbnailKey, buffer);
  return buffer;
}

function rgbToHsl({ red, green, blue }) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;

  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }

  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

function getHueDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

async function getModelColorProfile(item) {
  if (!item.modelStickerThumbnailKey) {
    return null;
  }

  if (modelColorCache.has(item.modelStickerThumbnailKey)) {
    return modelColorCache.get(item.modelStickerThumbnailKey);
  }

  const input = await getModelImageBuffer(item);

  if (!input) {
    return null;
  }

  const { data, info } = await sharp(input).resize(72, 72, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = [];

  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = data[index + 3];

    if (alpha < 40) {
      continue;
    }

    const color = rgbToHsl({ red: data[index], green: data[index + 1], blue: data[index + 2] });

    if (color.lightness < 0.08 || color.lightness > 0.94) {
      continue;
    }

    pixels.push(color);
  }

  const profile = { pixels };
  modelColorCache.set(item.modelStickerThumbnailKey, profile);
  return profile;
}

function getBackdropProfiles(item) {
  return [item.backdropColors?.center, item.backdropColors?.edge]
    .map(intToRgb)
    .filter(Boolean)
    .map(rgbToHsl);
}

function getItemPhotoUrl(item) {
  return item.modelStickerThumbnailKey ? `https://cdn.tgmrkt.io/${item.modelStickerThumbnailKey}` : null;
}

function getPreviewBackdropColors(item) {
  const colors = [item.backdropColors?.center, item.backdropColors?.edge]
    .map(intToRgb)
    .filter(Boolean);

  if (colors.length >= 2) {
    return colors;
  }

  return getFallbackBackdropColors(item.background);
}

async function buildItemPreviewImage(item) {
  const input = await getModelImageBuffer(item);

  if (!input) {
    return null;
  }

  const [centerColor, edgeColor] = getPreviewBackdropColors(item);
  const center = rgbToHex(centerColor);
  const edge = rgbToHex(edgeColor);
  const background = Buffer.from(`
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${center}"/>
          <stop offset="1" stop-color="${edge}"/>
        </linearGradient>
        <pattern id="dots" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <circle cx="16" cy="18" r="6" fill="#000" opacity="0.07"/>
          <circle cx="42" cy="45" r="4" fill="#fff" opacity="0.08"/>
          <path d="M52 16c8 0 8 12 0 12s-8-12 0-12zM62 26c0 8-12 8-12 0s12-8 12 0z" fill="#000" opacity="0.05"/>
        </pattern>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect width="512" height="512" fill="url(#bg)"/>
      <rect width="512" height="512" fill="url(#dots)"/>
    </svg>
  `);
  const model = await sharp(input).resize(500, 500, { fit: "inside" }).png().toBuffer();

  return sharp(background)
    .composite([{ input: model, gravity: "center" }])
    .png()
    .toBuffer();
}

async function getVisualMonochromeResult(item) {
  const backdropProfiles = getBackdropProfiles(item);
  const modelProfile = await getModelColorProfile(item);

  if (!modelProfile || modelProfile.pixels.length === 0) {
    return { match: null, reason: "no-model-colors" };
  }

  const coloredPixels = modelProfile.pixels.filter((pixel) => pixel.saturation >= 0.18);
  const neutralPixels = modelProfile.pixels.filter((pixel) => pixel.saturation < 0.22);
  const accentPixels = modelProfile.pixels.filter((pixel) => pixel.saturation >= 0.35);
  const dominantPixels = coloredPixels.length > 0 ? coloredPixels : modelProfile.pixels;
  const hueBuckets = new Map();

  const hueBucketSize = getDominantHueBucketSize();

  for (const pixel of dominantPixels) {
    const bucket = Math.round(pixel.hue / hueBucketSize) * hueBucketSize;
    hueBuckets.set(bucket, (hueBuckets.get(bucket) ?? 0) + 1);
  }

  const dominantHue = [...hueBuckets.entries()].reduce((best, entry) => {
    return entry[1] > best[1] ? entry : best;
  }, [0, 0])[0];
  const dominantShare = Math.max(...hueBuckets.values()) / dominantPixels.length;
  const neutralShare = neutralPixels.length / modelProfile.pixels.length;
  const accentShare = accentPixels.length / modelProfile.pixels.length;
  const visuallyNeutral = neutralShare >= getMinNeutralModelShare() && accentShare <= getMaxAccentShare();
  const visuallySingleColor = visuallyNeutral || dominantShare >= getMinSingleColorDominantShare();
  const metrics = {
    dominantHue,
    dominantShare: Number(dominantShare.toFixed(2)),
    neutralShare: Number(neutralShare.toFixed(2)),
    accentShare: Number(accentShare.toFixed(2)),
    coloredShare: Number((coloredPixels.length / modelProfile.pixels.length).toFixed(2))
  };

  if (!shouldRequireModelBackdropMatch()) {
    return {
      match: visuallySingleColor,
      reason: visuallySingleColor ? "single-color" : "multi-color-model",
      metrics
    };
  }

  if (backdropProfiles.length === 0) {
    return { match: false, reason: "no-backdrop-colors", metrics };
  }

  let closestBackdrop = null;

  for (const backdrop of backdropProfiles) {
    if (backdrop.saturation < 0.18) {
      if (visuallyNeutral) {
        return { match: true, reason: "neutral-backdrop-match", metrics };
      }

      continue;
    }

    if (coloredPixels.length === 0) {
      continue;
    }

    const hueDistance = getHueDistance(dominantHue, backdrop.hue);
    closestBackdrop = !closestBackdrop || hueDistance < closestBackdrop.hueDistance
      ? { hueDistance, backdropHue: backdrop.hue }
      : closestBackdrop;

    if (hueDistance > getMaxModelBackdropHueDistance()) {
      continue;
    }

    const matchingPixels = coloredPixels.filter((pixel) => getHueDistance(pixel.hue, backdrop.hue) <= getMaxModelBackdropHueDistance());
    const matchShare = matchingPixels.length / coloredPixels.length;
    const totalShare = matchingPixels.length / modelProfile.pixels.length;

    if (visuallySingleColor && matchShare >= getMinModelBackdropMatchShare() && totalShare >= getMinModelBackdropTotalShare()) {
      return {
        match: true,
        reason: "backdrop-hue-match",
        metrics: {
          ...metrics,
          backdropHue: Number(backdrop.hue.toFixed(1)),
          hueDistance: Number(hueDistance.toFixed(1)),
          matchShare: Number(matchShare.toFixed(2)),
          totalShare: Number(totalShare.toFixed(2))
        }
      };
    }
  }

  return {
    match: false,
    reason: coloredPixels.length === 0 ? "no-colored-model-pixels" : "backdrop-hue-mismatch",
    metrics: closestBackdrop
      ? {
        ...metrics,
        backdropHue: Number(closestBackdrop.backdropHue.toFixed(1)),
        hueDistance: Number(closestBackdrop.hueDistance.toFixed(1))
      }
      : metrics
  };
}

function getTextMonochromeMatch(item) {
  const background = item.background ?? "";
  const model = item.model ?? item.color ?? "";
  const backgroundFamilies = [];
  const modelFamilies = [];

  for (const family of monochromeColorFamilies) {
    if (includesAnyWord(background, family.backgrounds)) {
      backgroundFamilies.push(family);
    }

    if (includesAnyWord(model, family.models)) {
      modelFamilies.push(family);
    }
  }

  const match = backgroundFamilies.some((family) => modelFamilies.includes(family));
  const hasBackgroundFamily = backgroundFamilies.length > 0;
  const hasModelFamily = modelFamilies.length > 0;

  return {
    match,
    mismatch: hasBackgroundFamily && hasModelFamily && !match,
    hasBackgroundFamily,
    hasModelFamily
  };
}

async function getMonochromeResult(item) {
  const textMatch = getTextMonochromeMatch(item);
  const visualMatch = await getVisualMonochromeResult(item);

  if (textMatch.mismatch) {
    return {
      match: false,
      source: "text-mismatch",
      textMatch: false,
      visualReason: "text-family-mismatch",
      visualMetrics: visualMatch.metrics ?? null
    };
  }

  if (textMatch.match && shouldPreferTextMonochromeMatch()) {
    return {
      match: true,
      source: visualMatch.match ? "visual+text" : "text-family",
      textMatch: true,
      visualReason: visualMatch.reason,
      visualMetrics: visualMatch.metrics ?? null
    };
  }

  if (textMatch.match) {
    return {
      match: true,
      source: visualMatch.match ? "visual+text" : "text",
      textMatch: true,
      visualReason: visualMatch.reason,
      visualMetrics: visualMatch.metrics ?? null
    };
  }

  if (visualMatch.match !== null) {
    return {
      match: visualMatch.match,
      source: "visual",
      textMatch: false,
      visualReason: visualMatch.reason,
      visualMetrics: visualMatch.metrics ?? null
    };
  }

  return {
    match: shouldAllowTextMonochromeFallback() && textMatch.match,
    source: "text-fallback",
    textMatch: textMatch.match,
    visualReason: visualMatch.reason,
    visualMetrics: visualMatch.metrics ?? null
  };
}

async function isMonochrome(item) {
  return (await getMonochromeResult(item)).match;
}

function logMonochromeReject(item, result, count) {
  const debugLimit = getMonochromeDebugLimit();

  if (debugLimit === 0 || count > debugLimit) {
    return;
  }

  console.log(`${new Date().toISOString()} monochrome reject ${JSON.stringify({
    title: item.title,
    collection: item.collection,
    background: item.background,
    model: item.model ?? item.color ?? null,
    price: item.price,
    source: result.source,
    textMatch: result.textMatch,
    visualReason: result.visualReason,
    visualMetrics: result.visualMetrics
  })}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTon(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number.toFixed(2).replace(/\.00$/, "");
}

async function getResaleEstimate(item) {
  let backdropModelFloor = Number(item.resale?.backdropModelFloor);
  let collectionFloor = Number(item.resale?.collectionFloor);

  if (!Number.isFinite(backdropModelFloor) || backdropModelFloor <= 0) {
    try {
      backdropModelFloor = Number(await fetchModelFloorPrice(item.collection, item.model));
    } catch (_error) {
      backdropModelFloor = null;
    }
  }

  if (!Number.isFinite(collectionFloor) || collectionFloor <= 0) {
    try {
      collectionFloor = Number(await fetchCollectionFloorPrice(item.collection));
    } catch (_error) {
      collectionFloor = null;
    }
  }

  const estimate = Number.isFinite(backdropModelFloor) && backdropModelFloor > 0 ? backdropModelFloor : collectionFloor;

  if (!Number.isFinite(estimate) || estimate <= 0) {
    return null;
  }

  return {
    estimate,
    source: estimate === backdropModelFloor ? "floor модели" : "floor коллекции",
    spread: estimate - Number(item.price)
  };
}

function getMaxFloorMultiplier() {
  const value = Number(process.env.MARKET_ALERT_MAX_FLOOR_MULTIPLIER ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function getMaxFloorMultiplierForItem(item) {
  const collectionName = String(item.collection ?? "");
  const envName = `MARKET_ALERT_MAX_FLOOR_MULTIPLIER_${collectionName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const value = Number(process.env[envName] ?? getMaxFloorMultiplier());
  return Number.isFinite(value) && value > 0 ? value : getMaxFloorMultiplier();
}

function getMinResaleSpread() {
  const value = Number(process.env.MARKET_ALERT_MIN_RESALE_SPREAD ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getMinResaleSpreadForItem(item) {
  const collectionName = String(item.collection ?? "");
  const envName = `MARKET_ALERT_MIN_RESALE_SPREAD_${collectionName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const value = Number(process.env[envName] ?? getMinResaleSpread());
  return Number.isFinite(value) ? value : getMinResaleSpread();
}

function getMinBackgroundScore() {
  const value = Number(process.env.MARKET_ALERT_MIN_BACKGROUND_SCORE ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function hasGoodBackground(item) {
  const premiumBackground = getPremiumBackground(item.background);
  return Boolean(premiumBackground && Number(premiumBackground.score) >= getMinBackgroundScore());
}

function isBuyReadyMode() {
  return process.env.MARKET_BUY_READY === "true";
}

function shouldRequireBuyReadyMonochrome() {
  return process.env.MARKET_BUY_READY_REQUIRE_MONOCHROME !== "false";
}

function isAutoBuyEnabled() {
  return process.env.MARKET_AUTO_BUY === "true";
}

function getBuyReadyMaxPrice() {
  const value = Number(getMaxAlertPrice());
  return Number.isFinite(value) && value > 0 ? value : getMaxAlertPrice();
}

function getBuyReadyMinSpread() {
  const value = Number(process.env.MARKET_BUY_READY_MIN_SPREAD ?? getMinResaleSpread());
  return Number.isFinite(value) ? value : getMinResaleSpread();
}

function getBuyReadyDebugLimit() {
  const value = Number(process.env.MARKET_ALERT_BUY_READY_DEBUG_LIMIT ?? 5);
  return Number.isInteger(value) && value > 0 ? value : 5;
}

function getBuyDecision(item, resaleEstimate) {
  const price = Number(item.price);
  const spread = Number(resaleEstimate?.spread);
  const checks = {
    buyReadyMode: isBuyReadyMode(),
    autoBuyEnabled: isAutoBuyEnabled(),
    underMaxPrice: Number.isFinite(price) && price <= getBuyReadyMaxPrice(),
    enoughSpread: Number.isFinite(spread) && spread >= getBuyReadyMinSpread(),
    hasUrl: Boolean(item.url)
  };
  const ready = checks.buyReadyMode && checks.underMaxPrice && checks.enoughSpread && checks.hasUrl;

  return {
    ready,
    mode: checks.autoBuyEnabled ? "simulate" : "watch",
    checks,
    reason: ready
      ? checks.autoBuyEnabled
        ? "auto-buy requested, purchase endpoint is not implemented; simulated only"
        : "candidate is ready for manual buy review"
      : "candidate does not pass buy-ready checks"
  };
}

async function getResalePriceResult(item, resaleEstimate = null) {
  resaleEstimate = resaleEstimate ?? await getResaleEstimate(item);

  if (!resaleEstimate) {
    return { match: false, reason: "no-resale-estimate", resaleEstimate: null };
  }

  const price = Number(item.price);
  const maxAllowedPrice = resaleEstimate.estimate * getMaxFloorMultiplierForItem(item);
  const minSpread = getMinResaleSpreadForItem(item);

  if (!Number.isFinite(price) || price > maxAllowedPrice) {
    return { match: false, reason: "above-floor-multiplier", resaleEstimate, maxAllowedPrice, minSpread };
  }

  if (resaleEstimate.spread < minSpread) {
    return { match: false, reason: "below-min-spread", resaleEstimate, maxAllowedPrice, minSpread };
  }

  return { match: true, reason: "resale-ok", resaleEstimate, maxAllowedPrice, minSpread };
}

function applyResaleEstimateToItem(item, resaleEstimate) {
  if (!resaleEstimate) {
    return;
  }

  item.resale = {
    ...item.resale,
    backdropModelFloor: Number.isFinite(Number(item.resale?.backdropModelFloor)) && Number(item.resale.backdropModelFloor) > 0
      ? Number(item.resale.backdropModelFloor)
      : resaleEstimate.source === "floor модели"
        ? resaleEstimate.estimate
        : item.resale?.backdropModelFloor ?? null,
    collectionFloor: Number.isFinite(Number(item.resale?.collectionFloor)) && Number(item.resale.collectionFloor) > 0
      ? Number(item.resale.collectionFloor)
      : resaleEstimate.source === "floor коллекции"
        ? resaleEstimate.estimate
        : item.resale?.collectionFloor ?? null
  };
}

async function hasGoodResalePrice(item) {
  return (await getResalePriceResult(item)).match;
}

function logResaleReject(item, result, count) {
  const debugLimit = getResaleDebugLimit();

  if (debugLimit === 0 || count > debugLimit) {
    return;
  }

  console.log(`${new Date().toISOString()} resale reject ${JSON.stringify({
    title: item.title,
    collection: item.collection,
    background: item.background,
    model: item.model ?? item.color ?? null,
    price: item.price,
    reason: result.reason,
    estimate: result.resaleEstimate?.estimate ?? null,
    spread: result.resaleEstimate?.spread ?? null,
    source: result.resaleEstimate?.source ?? null,
    maxAllowedPrice: Number.isFinite(result.maxAllowedPrice) ? Number(result.maxAllowedPrice.toFixed(2)) : null,
    minSpread: result.minSpread ?? null
  })}`);
}

function getAlertQualityLabel(resaleResult, buyDecision) {
  if (buyDecision?.ready || resaleResult?.match) {
    return "GOOD";
  }

  return "RISKY";
}

async function formatAlert(item, rule, qualityLabel = null, alertMode = null) {
  const premiumBackground = getPremiumBackground(item.background);
  const resaleEstimate = await getResaleEstimate(item);
  const lines = [
    alertMode === "buy-ready" ? "Найден MRKT лот по floor" : "Найден дешёвый монохром MRKT",
    "",
    `Оценка: ${escapeHtml(qualityLabel ?? "GOOD")}`,
    "",
    `<b>${escapeHtml(item.title)}</b>`,
    `Номер: ${escapeHtml(item.number ?? "не указан")}`,
    `Коллекция: ${escapeHtml(item.collection)}`,
    `Фон: ${escapeHtml(item.background ?? "не указан")}`,
    `Приоритет фона: ${escapeHtml(premiumBackground?.score ?? "не указан")}`,
    `Модель/цвет: ${escapeHtml(item.model ?? item.color ?? "не указан")}`,
    `Цена: ${escapeHtml(item.price)} ${escapeHtml(item.currency)}`,
    `Оборот лота: ${escapeHtml(item.resale?.salesCount ?? "не указан")}`
  ];

  if (resaleEstimate) {
    lines.push(
      `Floor для перепродажи: ~${escapeHtml(formatTon(resaleEstimate.estimate))} ${escapeHtml(item.currency)} (${escapeHtml(resaleEstimate.source)})`,
      `Потенциал: ${escapeHtml(formatTon(resaleEstimate.spread))} ${escapeHtml(item.currency)}`
    );
  } else {
    lines.push("Оценка перепродажи: floor не указан MRKT");
  }

  if (item.url) {
    lines.push(`Ссылка: ${escapeHtml(item.url)}`);
  }

  return lines.join("\n");
}

async function buildCandidate(item, resaleEstimate, buyDecision, status = null, candidateReason = null, alertMode = null) {
  const modelFloor = Number(item.resale?.backdropModelFloor);
  const collectionFloor = Number(item.resale?.collectionFloor);

  return {
    externalItemId: item.externalItemId,
    title: item.title,
    collection: item.collection,
    model: item.model ?? item.color ?? null,
    background: item.background ?? null,
    photoUrl: getItemPhotoUrl(item),
    price: Number(item.price),
    currency: item.currency,
    modelFloor: Number.isFinite(modelFloor) && modelFloor > 0 ? modelFloor : null,
    collectionFloor: Number.isFinite(collectionFloor) && collectionFloor > 0 ? collectionFloor : null,
    resaleEstimate: resaleEstimate?.estimate ?? null,
    resaleSpread: resaleEstimate?.spread ?? null,
    resaleRatio: resaleEstimate?.estimate && Number(item.price) > 0
      ? resaleEstimate.estimate / Number(item.price)
      : null,
    resaleSource: resaleEstimate?.source ?? null,
    buyReady: buyDecision?.ready ?? false,
    buyMode: buyDecision?.mode ?? "off",
    buyDecision: buyDecision ?? null,
    buyCheckedAt: buyDecision ? new Date().toISOString() : null,
    salesCount: item.resale?.salesCount ?? null,
    externalMarkets: createExternalMarketLinks(item),
    url: item.url,
    candidateReason,
    telegramEligible: status === "sent",
    alertMode: alertMode ?? (status === "sent" ? "buy-ready" : shouldNotifyFoundMonochrome() ? "found-monochrome" : "json-only"),
    status: status ?? (isDryRun() ? "found" : "sent"),
    firstSeenAt: item.firstSeenAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    notifiedAt: status === "sent" && !isDryRun() ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString()
  };
}

function incrementReasonCounter(counters, key) {
  const normalizedKey = String(key ?? "unknown");
  counters[normalizedKey] = (counters[normalizedKey] ?? 0) + 1;
}

function getFailedBuyReadyReason(buyDecision) {
  if (!buyDecision?.checks) {
    return "unknown";
  }

  if (buyDecision.checks.buyReadyMode && buyDecision.checks.underMaxPrice && buyDecision.checks.hasUrl && !buyDecision.checks.enoughSpread) {
    return Number.isFinite(Number(buyDecision.spread)) ? "enoughSpread" : "noResaleEstimate";
  }

  for (const key of ["buyReadyMode", "underMaxPrice", "enoughSpread", "hasUrl"]) {
    if (!buyDecision.checks[key]) {
      return key;
    }
  }

  return "unknown";
}

async function runMarketAlertScanCore() {
  await loadNotifiedItemIds();

  const marketItems = await fetchMarketItems();
  const matches = [];
  let notifiedCount = 0;
  const skipped = {
    duplicate: 0,
    rule: 0,
    monochrome: 0,
    background: 0,
    resale: 0
  };
  const reasonStats = {
    monochrome: {},
    resale: {},
    buyReady: {}
  };
  const buyReadyNearMisses = [];

  for (const item of marketItems) {
    if (notifiedItemIds.has(item.externalItemId)) {
      skipped.duplicate += 1;
      continue;
    }

    const rule = rules.find((entry) => matchesRule(item, entry));

    if (!rule) {
      skipped.rule += 1;
      continue;
    }

    const resaleEstimate = await getResaleEstimate(item);
    const resaleResult = await getResalePriceResult(item, resaleEstimate);
    applyResaleEstimateToItem(item, resaleEstimate);

    const monochromeResult = shouldRequireMonochrome() || shouldRequireBuyReadyMonochrome()
      ? await getMonochromeResult(item)
      : null;

    const buyDecision = getBuyDecision(item, resaleEstimate);
    const shouldNotifyBuyReady = buyDecision.ready && (!shouldRequireBuyReadyMonochrome() || monochromeResult?.match) && !isDryRun();

    if (shouldNotifyBuyReady) {
      await upsertAlertCandidate(await buildCandidate(
        item,
        resaleEstimate,
        buyDecision,
        "sent",
        "floor-resale",
        "buy-ready"
      ));

      const previewImage = await buildItemPreviewImage(item);
      await sendTelegramAlert(await formatAlert(item, rule, getAlertQualityLabel(resaleResult, buyDecision), "buy-ready"), {
        url: item.url,
        photoBuffer: previewImage,
        photoFilename: `${item.externalItemId}.png`,
        photoUrl: getItemPhotoUrl(item)
      });
      notifiedCount += 1;
      notifiedItemIds.add(item.externalItemId);
      await saveNotifiedItemIds();
      matches.push({ item, rule });

      if (notifiedCount >= getMaxAlertsPerScan()) {
        break;
      }

      continue;
    }

    if (!buyDecision.ready) {
      incrementReasonCounter(reasonStats.buyReady, getFailedBuyReadyReason(buyDecision));
    }

    if (shouldRequireMonochrome()) {
      if (!monochromeResult?.match) {
        skipped.monochrome += 1;
        incrementReasonCounter(reasonStats.monochrome, monochromeResult?.visualReason ?? monochromeResult?.source ?? "unknown");
        logMonochromeReject(item, monochromeResult, skipped.monochrome);
        continue;
      }
    }

    if (!hasGoodBackground(item)) {
      skipped.background += 1;
      continue;
    }

    if (!buyDecision.ready && buyDecision.checks.buyReadyMode && buyDecision.checks.underMaxPrice && buyDecision.checks.hasUrl && !buyDecision.checks.enoughSpread) {
      buyReadyNearMisses.push({
        title: item.title,
        collection: item.collection,
        background: item.background,
        model: item.model ?? item.color ?? null,
        price: Number(item.price),
        estimate: Number.isFinite(Number(resaleEstimate?.estimate)) ? Number(resaleEstimate.estimate) : null,
        spread: Number.isFinite(Number(resaleEstimate?.spread)) ? Number(resaleEstimate.spread) : null,
        minSpread: getBuyReadyMinSpread(),
        url: item.url ?? null
      });
    }

    const notifyFoundMonochrome = shouldNotifyFoundMonochrome() && !isDryRun();
    await upsertAlertCandidate(await buildCandidate(item, null, null, notifyFoundMonochrome ? "sent" : "found", "monochrome-background", notifyFoundMonochrome ? "found-monochrome" : "json-only"));

    if (!resaleResult.match && !notifyFoundMonochrome) {
      skipped.resale += 1;
      incrementReasonCounter(reasonStats.resale, resaleResult.reason);
      logResaleReject(item, resaleResult, skipped.resale);
      continue;
    }

    if (!resaleResult.match) {
      skipped.resale += 1;
      incrementReasonCounter(reasonStats.resale, resaleResult.reason);
      logResaleReject(item, resaleResult, skipped.resale);
    }

    const shouldNotify = buyDecision.ready && !isDryRun();
    await upsertAlertCandidate(await buildCandidate(
      item,
      resaleEstimate,
      buyDecision,
      shouldNotify || notifyFoundMonochrome ? "sent" : "found",
      "monochrome-background",
      shouldNotify ? "buy-ready" : notifyFoundMonochrome ? "found-monochrome" : "json-only"
    ));

    if (shouldNotify || notifyFoundMonochrome) {
      const previewImage = await buildItemPreviewImage(item);
      await sendTelegramAlert(await formatAlert(item, rule, getAlertQualityLabel(resaleResult, buyDecision), shouldNotify ? "buy-ready" : "found-monochrome"), {
        url: item.url,
        photoBuffer: previewImage,
        photoFilename: `${item.externalItemId}.png`,
        photoUrl: getItemPhotoUrl(item)
      });
      notifiedCount += 1;
      notifiedItemIds.add(item.externalItemId);
      await saveNotifiedItemIds();
    }

    matches.push({ item, rule });

    if (notifiedCount >= getMaxAlertsPerScan()) {
      break;
    }
  }

  if (process.env.MARKET_ALERT_FILTER_STATS !== "false") {
    console.log(`${new Date().toISOString()} filter stats ${JSON.stringify(skipped)}`);
    console.log(`${new Date().toISOString()} reason stats ${JSON.stringify(reasonStats)}`);

    if (buyReadyNearMisses.length > 0) {
      const nearMisses = buyReadyNearMisses
        .sort((left, right) => {
          const leftDeficit = Number.isFinite(left.spread) ? left.minSpread - left.spread : Number.POSITIVE_INFINITY;
          const rightDeficit = Number.isFinite(right.spread) ? right.minSpread - right.spread : Number.POSITIVE_INFINITY;
          return leftDeficit - rightDeficit;
        })
        .slice(0, getBuyReadyDebugLimit())
        .map((entry) => ({
          title: entry.title,
          collection: entry.collection,
          background: entry.background,
          model: entry.model,
          price: Number.isFinite(entry.price) ? Number(entry.price.toFixed(2)) : null,
          estimate: Number.isFinite(entry.estimate) ? Number(entry.estimate.toFixed(2)) : null,
          spread: Number.isFinite(entry.spread) ? Number(entry.spread.toFixed(2)) : null,
          deficit: Number.isFinite(entry.spread) ? Number((entry.minSpread - entry.spread).toFixed(2)) : null,
          url: entry.url
        }));

      console.log(`${new Date().toISOString()} buy-ready near miss ${JSON.stringify(nearMisses)}`);
    }
  }

  return {
    scanned: marketItems.length,
    notified: notifiedCount,
    skipped,
    reasonStats,
    matches
  };
}

export async function runMarketAlertScan() {
  lastScanAt = Date.now();

  try {
    return await runMarketAlertScanCore();
  } catch (error) {
    if (String(error?.message ?? error).includes("MRKT API temporarily banned requests")) {
      bannedUntil = Date.now() + getBannedCooldownMs();
    }

    throw error;
  }
}

export function getAlertScanState() {
  return {
    lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : null,
    cooldownMs: 0,
    bannedUntil: bannedUntil ? new Date(bannedUntil).toISOString() : null,
    inFlight: Boolean(scanInFlight),
    candidateCount: null
  };
}

export async function getAlertDashboardData() {
  const candidates = await listAlertCandidates();

  return {
    candidates,
    scan: {
      ...getAlertScanState(),
      candidateCount: candidates.length
    }
  };
}

export async function runMarketAlertScanSafely({ manual = false } = {}) {
  if (scanInFlight) {
    return scanInFlight;
  }

  const now = Date.now();

  if (bannedUntil > now) {
    const waitSeconds = Math.ceil((bannedUntil - now) / 1000);
    throw new Error(`MRKT banned cooldown active for ${waitSeconds}s`);
  }

  scanInFlight = runMarketAlertScan().finally(() => {
    scanInFlight = null;
  });

  return scanInFlight;
}
