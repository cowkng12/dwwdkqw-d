import { SectionCard } from "./components/section-card";
import { CandidatesDashboard } from "./components/candidates-dashboard";

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const response = await fetch(`${apiBaseUrl}${path}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json();
}

async function getOptionalJson(path) {
  try {
    return await getJson(path);
  } catch (error) {
    return { error: error.message };
  }
}

export default async function HomePage() {
  const [{ user }, { rules }, { items }, { purchases }, status, accountResult, candidatesResult] = await Promise.all([
    getJson("/me"),
    getJson("/rules"),
    getJson("/items"),
    getJson("/purchases"),
    getJson("/telegram/status"),
    getOptionalJson("/telegram/account"),
    getOptionalJson("/api/alerts/candidates")
  ]);

  const { telegram, bot } = status;
  const account = accountResult.account;
  const candidates = candidatesResult.candidates ?? [];
  const scan = candidatesResult.scan ?? { cooldownMs: 300000, lastScanAt: null, bannedUntil: null };
  const accountLabel = account?.user?.username
    ? `@${account.user.username}`
    : account?.user?.id ?? "не проверен";

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Telegram Alerts MVP</p>
        <h1>MRKT Deal Alerts</h1>
        <p className="lead">
          Интерфейс для мониторинга дешевых подарков MRKT, локального списка кандидатов и уведомлений в Telegram.
        </p>
      </section>

      <CandidatesDashboard initialCandidates={candidates} scan={scan} apiBaseUrl={apiBaseUrl} />

      <section className="grid">
        <SectionCard title="Пользователь">
          <p>{user.firstName} @{user.username}</p>
          <p>Telegram ID: {user.telegramId}</p>
        </SectionCard>

        <SectionCard title="Telegram API">
          <p>Статус: {telegram.isConfigured ? "api подключен" : "нужен api_id/api_hash"}</p>
          <p>Сессия: {telegram.hasSession ? "готова" : "ещё не добавлена"}</p>
          <p>API ID: {telegram.apiId ?? "не указан"}</p>
          <p>Аккаунт: {account?.authorized ? accountLabel : "не проверен"}</p>
          <p>Бот: {bot.isConfigured ? "готов" : "нужен bot token/chat id"}</p>
        </SectionCard>

        <SectionCard title="Активные правила">
          {rules.map((rule) => (
            <div key={rule.id} className="stack">
              <strong>Лимит: {rule.maxPrice} TON</strong>
              <span>Коллекции: {rule.collections.join(", ")}</span>
              <span>Уведомления: {rule.enabled ? "вкл" : "выкл"}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Найденные лоты">
          {items.map((item) => (
            <div key={item.id} className="stack">
              <strong>{item.title}</strong>
              <span>{item.collection}</span>
              <span>{item.price} {item.currency}</span>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="История">
          {purchases.map((purchase) => (
            <div key={purchase.id} className="stack">
              <strong>Попытка #{purchase.id}</strong>
              <span>Статус: {purchase.status}</span>
              <span>Rule ID: {purchase.ruleId}</span>
            </div>
          ))}
        </SectionCard>
      </section>

      <section className="note">
        <p>
          Ручной scan ограничен cooldown и нужен только для редких проверок, чтобы не продлевать ban MRKT.
        </p>
      </section>
    </main>
  );
}
