import { getPremiumBackgroundNames } from "../monitor/backgrounds.js";
import { getMrktAuthToken } from "./auth.js";
import { defaultTargetBackgrounds, defaultTargetCollections, getScanPreferences } from "./scan-config.js";

const MRKT_API_URL = "https://api.tgmrkt.io/api/v1";
const collectionFloorCache = new Map();
const modelFloorCache = new Map();

function getEnvList(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCollectionEnvName(collectionName) {
  return `MRKT_TARGET_BACKGROUNDS_${String(collectionName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

function getCollectionPageSizeEnvName(collectionName) {
  return `MRKT_PAGE_SIZE_${String(collectionName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

function getPageSizeForCollection(collectionName, fallbackCount) {
  const value = Number(process.env[getCollectionPageSizeEnvName(collectionName)] ?? fallbackCount);
  return Number.isInteger(value) && value > 0 ? value : fallbackCount;
}

function getMrktConfig() {
  const preferences = getScanPreferences();

  return {
    maxPrice: preferences.maxPrice,
    count: Number(process.env.MRKT_PAGE_SIZE ?? 12),
    targetCollections: preferences.collections.length > 0 ? preferences.collections : defaultTargetCollections,
    scanByBackdrop: process.env.MRKT_SCAN_BY_BACKDROP === "true",
    targetBackgrounds: [...new Set([...(preferences.backgrounds.length > 0 ? preferences.backgrounds : defaultTargetBackgrounds), ...getPremiumBackgroundNames()])].slice(0, Number(process.env.MRKT_TARGET_BACKGROUNDS_LIMIT ?? 120)),
    targetBackgroundsLimit: Number(process.env.MRKT_TARGET_BACKGROUNDS_LIMIT ?? 120)
  };
}

function getTargetBackgroundsForCollection(collectionName, config) {
  const collectionBackgrounds = getEnvList(getCollectionEnvName(collectionName));
  const backgrounds = collectionBackgrounds.length > 0 ? collectionBackgrounds : config.targetBackgrounds;
  return backgrounds.slice(0, config.targetBackgroundsLimit);
}

function createRequestBody({ backdropName = null, collectionName = null, modelName = null } = {}) {
  const config = getMrktConfig();

  return {
    collectionNames: collectionName ? [collectionName] : [],
    modelNames: modelName ? [modelName] : [],
    backdropNames: backdropName ? [backdropName] : [],
    symbolNames: [],
    ordering: "Price",
    lowToHigh: true,
    maxPrice: null,
    minPrice: null,
    mintable: null,
    number: null,
    count: collectionName ? getPageSizeForCollection(collectionName, config.count) : config.count,
    cursor: "",
    query: null,
    promotedFirst: false
  };
}

function createUnfilteredRequestBody() {
  const config = getMrktConfig();

  return {
    collectionNames: [],
    modelNames: [],
    backdropNames: [],
    symbolNames: [],
    ordering: "Price",
    lowToHigh: true,
    maxPrice: null,
    minPrice: null,
    mintable: null,
    number: null,
    count: config.count,
    cursor: "",
    query: null,
    promotedFirst: false
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postMrktSaling(token, body) {
  let response;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await fetch(`${MRKT_API_URL}/gifts/saling`, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          authorization: token,
          origin: "https://cdn.tgmrkt.io",
          referer: "https://cdn.tgmrkt.io/",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
        },
        body: JSON.stringify(body)
      });
      break;
    } catch (error) {
      if (attempt === 2 || !String(error?.message ?? error).includes("fetch failed")) {
        throw error;
      }

      await sleep(1200);
    }
  }

  const responseText = await response.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch (_error) {
    if (responseText.trim().toLowerCase() === "banned") {
      throw new Error("MRKT API temporarily banned requests");
    }

    throw new Error(`MRKT API returned non-JSON response: ${responseText.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `MRKT API request failed: ${response.status}`);
  }

  return payload;
}

export async function fetchMrktSalingGifts() {
  const config = getMrktConfig();
  const token = await getMrktAuthToken();

  const gifts = [];

  if (config.targetCollections.length > 0) {
    const seenGiftIds = new Set();
    const totalRequests = config.scanByBackdrop
      ? config.targetCollections.reduce((sum, collectionName) => {
        const backdropNames = getTargetBackgroundsForCollection(collectionName, config);
        return sum + (backdropNames.length > 0 ? backdropNames.length : getPremiumBackgroundNames().length);
      }, 0)
      : config.targetCollections.length;
    let requestNumber = 0;

    for (const collectionName of config.targetCollections) {
      if (!config.scanByBackdrop) {
        requestNumber += 1;

        if (process.env.MARKET_ALERT_PROGRESS !== "false") {
          console.log(`${new Date().toISOString()} MRKT ${requestNumber}/${totalRequests} ${collectionName}`);
        }

        const payload = await postMrktSaling(token, createRequestBody({ collectionName }));

        if (Array.isArray(payload.gifts)) {
          for (const gift of payload.gifts) {
            const id = String(gift.id ?? gift.name ?? `${collectionName}-${gifts.length}`);

            if (!seenGiftIds.has(id)) {
              seenGiftIds.add(id);
              gifts.push(gift);
            }
          }
        }

        continue;
      }

      const backdropNames = getTargetBackgroundsForCollection(collectionName, config);

      for (const backdropName of backdropNames) {
        requestNumber += 1;

        if (process.env.MARKET_ALERT_PROGRESS !== "false" && (requestNumber === 1 || requestNumber % 10 === 0)) {
          console.log(`${new Date().toISOString()} MRKT ${requestNumber}/${totalRequests} ${collectionName} / ${backdropName}`);
        }

        let payload;

        try {
          payload = await postMrktSaling(token, createRequestBody({ collectionName, backdropName }));
        } catch (error) {
          const message = String(error?.message ?? error);

          if (message.includes("MRKT API request failed: 400") || message.includes("MRKT API request failed: 502") || message.includes("fetch failed")) {
            continue;
          }

          throw error;
        }

        if (Array.isArray(payload.gifts)) {
          for (const gift of payload.gifts) {
            const id = String(gift.id ?? gift.name ?? `${collectionName}-${backdropName}-${gifts.length}`);

            if (!seenGiftIds.has(id)) {
              seenGiftIds.add(id);
              gifts.push(gift);
            }
          }
        }
      }
    }

    return gifts;
  }

  for (const backdropName of getPremiumBackgroundNames()) {
    const payload = await postMrktSaling(token, createRequestBody({ backdropName }));

    if (Array.isArray(payload.gifts)) {
      gifts.push(...payload.gifts);
    }
  }

  return gifts;
}

export async function fetchMrktRawGifts() {
  const token = await getMrktAuthToken();
  const payload = await postMrktSaling(token, createUnfilteredRequestBody());
  return Array.isArray(payload.gifts) ? payload.gifts : [];
}

export async function fetchMrktRawPayload() {
  const token = await getMrktAuthToken();
  return postMrktSaling(token, createUnfilteredRequestBody());
}

export async function fetchCollectionFloorPrice(collectionName) {
  if (collectionFloorCache.has(collectionName)) {
    return collectionFloorCache.get(collectionName);
  }

  const token = await getMrktAuthToken();
  const payload = await postMrktSaling(token, {
    ...createRequestBody({ collectionName }),
    count: 1
  });
  const gift = Array.isArray(payload.gifts) ? payload.gifts[0] : null;
  const price = gift?.salePrice ? Number(gift.salePrice) / 1_000_000_000 : null;

  collectionFloorCache.set(collectionName, price);
  return price;
}

export async function fetchModelFloorPrice(collectionName, modelName) {
  if (!collectionName || !modelName) {
    return null;
  }

  const cacheKey = `${collectionName}\u0000${modelName}`;

  if (modelFloorCache.has(cacheKey)) {
    return modelFloorCache.get(cacheKey);
  }

  const token = await getMrktAuthToken();
  const payload = await postMrktSaling(token, {
    ...createRequestBody({ collectionName, modelName }),
    count: 1
  });
  const gift = Array.isArray(payload.gifts) ? payload.gifts[0] : null;
  const price = gift?.salePrice ? Number(gift.salePrice) / 1_000_000_000 : null;

  modelFloorCache.set(cacheKey, price);
  return price;
}
