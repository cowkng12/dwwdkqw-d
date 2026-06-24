"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

const REFRESH_INTERVAL_MS = 60000;

function formatTon(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return `${number.toFixed(2).replace(/\.00$/, "")} TON`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function statusLabel(status) {
  if (status === "sent") {
    return "отправлен";
  }

  if (status === "viewed") {
    return "просмотрен";
  }

  return "найден";
}

function candidateReasonLabel(reason) {
  if (reason === "monochrome-background") {
    return "монохром + хороший фон";
  }

  return reason ?? "-";
}

export function CandidatesDashboard({ initialCandidates, scan, apiBaseUrl }) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [scanState, setScanState] = useState(scan);
  const [selectedCollection, setSelectedCollection] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [minSpread, setMinSpread] = useState("");
  const [onlyMonochrome, setOnlyMonochrome] = useState(true);
  const [hideViewed, setHideViewed] = useState(true);
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      return;
    }

    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor("#000000");
    webApp.setBackgroundColor("#000000");
  }, []);

  const collections = useMemo(() => {
    return [...new Set(candidates.map((candidate) => candidate.collection).filter(Boolean))].sort((first, second) => {
      return first.localeCompare(second, "ru");
    });
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (selectedCollection !== "all" && candidate.collection !== selectedCollection) {
        return false;
      }

      if (hideViewed && candidate.status === "viewed") {
        return false;
      }

      if (onlyMonochrome && candidate.candidateReason !== "monochrome-background") {
        return false;
      }

      if (maxPrice && Number(candidate.price) > Number(maxPrice)) {
        return false;
      }

      if (minSpread && Number(candidate.resaleSpread ?? 0) < Number(minSpread)) {
        return false;
      }

      return true;
    });
  }, [candidates, hideViewed, maxPrice, minSpread, onlyMonochrome, selectedCollection]);

  useEffect(() => {
    let cancelled = false;

    async function refreshCandidates() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/alerts/candidates`, { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || cancelled) {
          return;
        }

        setCandidates(payload.candidates ?? []);
        setScanState(payload.scan ?? scan);
      } catch (_error) {
      }
    }

    const intervalId = setInterval(refreshCandidates, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [apiBaseUrl, scan]);

  function updateCandidateStatus(externalItemId, status) {
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/alerts/candidates/${encodeURIComponent(externalItemId)}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ status })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Не удалось обновить статус");
        }

        setCandidates((current) => {
          return current.map((candidate) => {
            return candidate.externalItemId === externalItemId ? payload.candidate : candidate;
          });
        });
      } catch (requestError) {
        setError(requestError.message);
      }
    });
  }

  function triggerScan() {
    setError("");
    setScanMessage("");

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/alerts/scan`, { method: "POST" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Не удалось запустить scan");
        }

        const refreshedResponse = await fetch(`${apiBaseUrl}/api/alerts/candidates`, { cache: "no-store" });
        const refreshedPayload = await refreshedResponse.json();

        if (!refreshedResponse.ok) {
          throw new Error(refreshedPayload.error || "Не удалось обновить список кандидатов");
        }

        setCandidates(refreshedPayload.candidates ?? []);
        setScanState(refreshedPayload.scan ?? scan);
        setScanMessage(`Скан завершён: ${payload.result.notified} кандидатов`);
      } catch (requestError) {
        setError(requestError.message);
      }
    });
  }

  return (
    <section className="dashboard-card">
      <div className="toolbar">
        <div>
          <p className="eyebrow">MRKT Candidates</p>
          <h2>Кандидаты для выкупа</h2>
          <p className="muted">
            Последний scan: {formatDateTime(scanState.lastScanAt)}. Минимальный интервал: {Math.round((scanState.cooldownMs ?? 300000) / 60000)} мин.
          </p>
          <p className="muted">
            Ban cooldown до: {formatDateTime(scanState.bannedUntil)}. Всего кандидатов: {candidates.length}. UI обновляется раз в минуту.
          </p>
        </div>

        <button className="button secondary" onClick={triggerScan} disabled={isPending}>
          Осторожный scan
        </button>
      </div>

      <div className="filters">
        <label>
          <span>Коллекция</span>
          <select value={selectedCollection} onChange={(event) => setSelectedCollection(event.target.value)}>
            <option value="all">Все</option>
            {collections.map((collection) => (
              <option key={collection} value={collection}>{collection}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Макс. цена</span>
          <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" placeholder="5" />
        </label>

        <label>
          <span>Мин. потенциал</span>
          <input value={minSpread} onChange={(event) => setMinSpread(event.target.value)} inputMode="decimal" placeholder="0.5" />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={hideViewed} onChange={(event) => setHideViewed(event.target.checked)} />
          <span>Скрыть просмотренные</span>
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={onlyMonochrome} onChange={(event) => setOnlyMonochrome(event.target.checked)} />
          <span>Только монохром</span>
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {scanMessage ? <p className="success-text">{scanMessage}</p> : null}

      <div className="candidates-grid">
        {filteredCandidates.length === 0 ? (
          <article className="candidate-card empty-state">
            <strong>Подходящих кандидатов пока нет</strong>
            <p>После безопасного scan найденные лоты появятся здесь и сохранятся локально.</p>
          </article>
        ) : (
          filteredCandidates.map((candidate) => (
            <article key={candidate.externalItemId} className="candidate-card">
              <div className="candidate-topline">
                <span className={`status-pill status-${candidate.status}`}>{statusLabel(candidate.status)}</span>
                <span className="muted">{candidate.collection}</span>
              </div>

              <h3>{candidate.title}</h3>
              <p className="muted">Модель: {candidate.model ?? "-"}</p>
              <p className="muted">Фон: {candidate.background ?? "-"}</p>
              <p className="muted">Тип: {candidateReasonLabel(candidate.candidateReason)}</p>
              <p className="muted">Telegram: {candidate.telegramEligible ? "строгий алерт" : "только JSON"}</p>

              <div className="metrics">
                <div>
                  <span>Цена</span>
                  <strong>{formatTon(candidate.price)}</strong>
                </div>
                <div>
                  <span>Floor модели</span>
                  <strong>{formatTon(candidate.modelFloor)}</strong>
                </div>
                <div>
                  <span>Floor коллекции</span>
                  <strong>{formatTon(candidate.collectionFloor)}</strong>
                </div>
                <div>
                  <span>Потенциал</span>
                  <strong>{formatTon(candidate.resaleSpread)}</strong>
                </div>
              </div>

              <p className="muted">Источник оценки: {candidate.resaleSource ?? "-"}</p>
              <p className="muted">Последнее обновление: {formatDateTime(candidate.lastSeenAt)}</p>

              <div className="actions-row">
                <a className="button" href={candidate.url ?? "#"} target="_blank" rel="noreferrer" aria-disabled={!candidate.url}>
                  Открыть лот
                </a>
                <button className="button secondary" onClick={() => updateCandidateStatus(candidate.externalItemId, "viewed")} disabled={isPending}>
                  Скрыть / просмотрено
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
