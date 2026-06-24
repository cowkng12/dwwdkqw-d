export const users = [
  {
    id: 1,
    telegramId: "demo-user",
    username: "demo",
    firstName: "Demo"
  }
];

export const rules = [
  {
    id: 1,
    userId: 1,
    enabled: true,
    maxPrice: 3.5,
    collections: ["Xmas Stocking", "Instant Ramen", "Lol Pop"],
    attributes: ["rare"],
    autoBuy: false,
    dailyLimit: 3,
    createdAt: new Date().toISOString()
  }
];

export const items = [
  {
    id: 1,
    externalItemId: "gift-1001-monochrome",
    collection: "Plush Pepe",
    title: "Plush Pepe",
    number: 1001,
    background: "Black",
    model: "Black",
    color: "Black",
    price: 12.5,
    currency: "TON",
    status: "new",
    url: "https://t.me/mrkt/app?startapp=8e79025ef2634ec3968b252192b2ada5",
    firstSeenAt: new Date().toISOString()
  }
];

export const purchases = [
  {
    id: 1,
    userId: 1,
    ruleId: 1,
    marketItemId: 1,
    status: "notified",
    errorMessage: null,
    createdAt: new Date().toISOString()
  }
];
