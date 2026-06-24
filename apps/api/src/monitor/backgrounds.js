export const premiumBackgrounds = [
  { name: "Black", score: 271 },
  { name: "White", score: 60 },
  { name: "Platinum", score: 60 },
  { name: "Silver", score: 55 },
  { name: "Gray", score: 50 },
  { name: "Grey", score: 50 },
  { name: "Steel Grey", score: 50 },
  { name: "Battleship Grey", score: 50 },
  { name: "Feldgrau", score: 50 },
  { name: "Electric Purple", score: 126 },
  { name: "Lavender", score: 110 },
  { name: "Purple", score: 90 },
  { name: "Violet", score: 85 },
  { name: "English Violet", score: 85 },
  { name: "Lilac", score: 85 },
  { name: "Dark Lilac", score: 85 },
  { name: "Cyberpunk", score: 154 },
  { name: "Electric Indigo", score: 149 },
  { name: "Neon Blue", score: 172 },
  { name: "Navy Blue", score: 90 },
  { name: "Sapphire", score: 121 },
  { name: "Sky Blue", score: 126 },
  { name: "Azure Blue", score: 158 },
  { name: "French Blue", score: 90 },
  { name: "Silver Blue", score: 90 },
  { name: "Blue", score: 90 },
  { name: "Cobalt Blue", score: 88 },
  { name: "Steel Blue", score: 84 },
  { name: "Maya Blue", score: 82 },
  { name: "Moonstone", score: 82 },
  { name: "Cyan", score: 80 },
  { name: "Teal", score: 78 },
  { name: "Pacific Cyan", score: 87 },
  { name: "Aquamarine", score: 115 },
  { name: "Turquoise", score: 90 },
  { name: "Pacific Green", score: 102 },
  { name: "Emerald", score: 126 },
  { name: "Mint Green", score: 144 },
  { name: "Malachite", score: 127 },
  { name: "Shamrock Green", score: 100 },
  { name: "Lemongrass", score: 100 },
  { name: "Green", score: 90 },
  { name: "Lime Green", score: 82 },
  { name: "Forest Green", score: 80 },
  { name: "Olive Green", score: 74 },
  { name: "Pistachio", score: 72 },
  { name: "Rifle Green", score: 70 },
  { name: "Khaki Green", score: 70 },
  { name: "Dark Green", score: 70 },
  { name: "Pine Green", score: 70 },
  { name: "Hunter Green", score: 70 },
  { name: "Jade Green", score: 70 },
  { name: "Yellow", score: 70 },
  { name: "Gold", score: 75 },
  { name: "Pure Gold", score: 75 },
  { name: "Satin Gold", score: 75 },
  { name: "Amber", score: 65 },
  { name: "Orange", score: 70 },
  { name: "Mustard", score: 65 },
  { name: "Carrot Juice", score: 65 },
  { name: "Red", score: 80 },
  { name: "Ruby", score: 84 },
  { name: "Crimson", score: 82 },
  { name: "Coral Red", score: 80 },
  { name: "Burnt Sienna", score: 65 },
  { name: "Burgundy", score: 70 },
  { name: "Pink", score: 70 },
  { name: "Magenta", score: 82 },
  { name: "Fuchsia", score: 82 },
  { name: "Raspberry", score: 78 },
  { name: "Mauve", score: 72 },
  { name: "Rose", score: 65 },
  { name: "Rosewood", score: 60 },
  { name: "Brown", score: 50 },
  { name: "Bronze", score: 62 },
  { name: "Copper", score: 62 },
  { name: "Beige", score: 55 },
  { name: "Sand", score: 55 },
  { name: "Ivory", score: 55 },
  { name: "Vanilla", score: 55 },
  { name: "Seal Brown", score: 50 },
  { name: "Chocolate", score: 50 },
  { name: "Chestnut", score: 50 },
  { name: "Caramel", score: 50 },
  { name: "Cappuccino", score: 50 }
];

export function normalizeBackgroundName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/g, "");
}

const premiumBackgroundMap = new Map(
  premiumBackgrounds.map((background) => [normalizeBackgroundName(background.name), background])
);

export function getPremiumBackground(value) {
  return premiumBackgroundMap.get(normalizeBackgroundName(value)) ?? null;
}

export function getPremiumBackgroundNames() {
  return premiumBackgrounds.map((background) => background.name);
}
