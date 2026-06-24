# MRKT Deal Alerts MVP

MVP scaffold for a Telegram Mini App and backend service that monitors monochrome MRKT gifts and sends Telegram bot alerts.

## Apps

- `apps/api` - Express API with in-memory demo data and MVP endpoints
- `apps/web` - Next.js dashboard that reads data from the API

## Run

```bash
npm install
npm run dev:api
npm run dev:web
```

If `npm` is not available in your shell, install `Node.js 20+` and reopen the terminal so `npm` is added to `PATH`.

## API endpoints

- `GET /health`
- `GET /telegram/status`
- `GET /telegram/account`
- `POST /auth/telegram`
- `GET /me`
- `GET /rules`
- `POST /rules`
- `PATCH /rules/:id`
- `GET /items`
- `GET /purchases`
- `POST /autobuy/toggle`
- `POST /monitor/run`

## Next steps

1. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` to `apps/api/.env`.
2. Connect a real MRKT market source in `apps/api/src/market/source.js`.
3. Add scheduled polling for market alerts.
4. Replace in-memory duplicate tracking with `PostgreSQL`.

## Telegram account config

Create `apps/api/.env`:

```bash
PORT=4000
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_SESSION=your_saved_session_string
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_ALERT_CHAT_ID=123456789
MRKT_AUTH_TOKEN=
MARKET_SOURCE_URL=
DEMO_MARKET_ENABLED=false
MARKET_ALERT_POLL_MS=30000
MONOCHROME_MAX_PRICE=1000000
```

`TELEGRAM_SESSION` can stay empty initially.

Get `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from https://my.telegram.org/apps. Use your own Telegram account, create an app, then copy `api_id` and `api_hash` into `apps/api/.env`.

Generate a real account session:

```bash
npm install
npm --workspace @mrkt/api run telegram:session
```

Then paste the printed value into `apps/api/.env` as `TELEGRAM_SESSION`.

Check that the account session works:

```bash
npm --workspace @mrkt/api run telegram:check
```

Get a MRKT WebApp token through your Telegram session:

```bash
npm --workspace @mrkt/api run mrkt:token
```

Debug real MRKT items:

```bash
npm --workspace @mrkt/api run mrkt:debug
```

## Telegram bot alerts

Create a bot in `@BotFather`, paste its token as `TELEGRAM_BOT_TOKEN`, then send any message to the bot and use your Telegram user/chat ID as `TELEGRAM_ALERT_CHAT_ID`.

Run one alert scan:

```bash
npm --workspace @mrkt/api run alerts:run
```

Find chats that have messaged the bot:

```bash
npm --workspace @mrkt/api run bot:chats
```

Run continuous polling:

```bash
npm --workspace @mrkt/api run alerts:poll
```

Set `MARKET_SOURCE_URL` to a real JSON endpoint that returns an array, `items`, or `results`. Demo data from `apps/api/src/data/store.js` is used only when `DEMO_MARKET_ENABLED=true`.

Monochrome matching uses normalized `color` or `model` against `background`. Alerts are sent only for premium backgrounds from `apps/api/src/monitor/backgrounds.js`; messages include exact title, number, collection, background, background priority, color/model, price, and lot link.

For the real MRKT API, either put the WebApp auth token into `MRKT_AUTH_TOKEN`, or leave it empty and use `TELEGRAM_SESSION` so the app can request a fresh WebApp token automatically. The app calls `https://api.tgmrkt.io/api/v1/gifts/saling` for each premium background, sorted by lowest price.
