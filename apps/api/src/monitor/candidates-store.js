import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const candidatesPath = process.env.MARKET_ALERT_CANDIDATES_PATH
  ? path.resolve(process.env.MARKET_ALERT_CANDIDATES_PATH)
  : path.resolve(moduleDir, "../../.data/alert-candidates.json");

let candidatesLoaded = false;
let candidates = [];
let writeQueue = Promise.resolve();

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    externalItemId: String(candidate.externalItemId),
    photoUrl: typeof candidate.photoUrl === "string" && candidate.photoUrl.length > 0 ? candidate.photoUrl : null,
    price: Number(candidate.price),
    modelFloor: Number.isFinite(Number(candidate.modelFloor)) ? Number(candidate.modelFloor) : null,
    collectionFloor: Number.isFinite(Number(candidate.collectionFloor)) ? Number(candidate.collectionFloor) : null,
    resaleEstimate: Number.isFinite(Number(candidate.resaleEstimate)) ? Number(candidate.resaleEstimate) : null,
    resaleSpread: Number.isFinite(Number(candidate.resaleSpread)) ? Number(candidate.resaleSpread) : null,
    resaleRatio: Number.isFinite(Number(candidate.resaleRatio)) ? Number(candidate.resaleRatio) : null
  };
}

async function ensureLoaded() {
  if (candidatesLoaded) {
    return;
  }

  try {
    const raw = await readFile(candidatesPath, "utf8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      candidates = parsed.map(normalizeCandidate);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  candidatesLoaded = true;
}

async function persist() {
  await mkdir(path.dirname(candidatesPath), { recursive: true });
  await writeFile(candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`);
}

function enqueuePersist() {
  writeQueue = writeQueue.then(() => persist());
  return writeQueue;
}

export async function listAlertCandidates() {
  await ensureLoaded();

  return [...candidates].sort((first, second) => {
    return String(second.lastSeenAt ?? "").localeCompare(String(first.lastSeenAt ?? ""));
  });
}

export async function upsertAlertCandidate(candidate) {
  await ensureLoaded();

  const normalized = normalizeCandidate(candidate);
  const index = candidates.findIndex((entry) => entry.externalItemId === normalized.externalItemId);

  if (index === -1) {
    candidates.unshift(normalized);
  } else {
    candidates[index] = {
      ...candidates[index],
      ...normalized,
      viewedAt: candidates[index].viewedAt ?? null,
      hiddenAt: candidates[index].hiddenAt ?? null,
      status: candidates[index].status === "viewed" && normalized.status !== "sent"
        ? "viewed"
        : normalized.status
    };
  }

  await enqueuePersist();
  return normalized;
}

export async function updateAlertCandidateStatus(externalItemId, status) {
  await ensureLoaded();

  const index = candidates.findIndex((entry) => entry.externalItemId === String(externalItemId));

  if (index === -1) {
    return null;
  }

  const timestamp = new Date().toISOString();
  candidates[index] = {
    ...candidates[index],
    status,
    viewedAt: status === "viewed" ? timestamp : candidates[index].viewedAt ?? null,
    hiddenAt: status === "viewed" ? timestamp : candidates[index].hiddenAt ?? null,
    updatedAt: timestamp
  };

  await enqueuePersist();
  return candidates[index];
}
