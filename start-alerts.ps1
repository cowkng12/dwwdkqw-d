$env:MONOCHROME_MAX_PRICE = if ($env:MONOCHROME_MAX_PRICE) { $env:MONOCHROME_MAX_PRICE } else { "100" }
$env:MARKET_BUY_READY_MAX_PRICE = if ($env:MARKET_BUY_READY_MAX_PRICE) { $env:MARKET_BUY_READY_MAX_PRICE } else { "100" }
$env:MARKET_ALERT_MAX_PER_SCAN = if ($env:MARKET_ALERT_MAX_PER_SCAN) { $env:MARKET_ALERT_MAX_PER_SCAN } else { "5" }
$env:MARKET_ALERT_PROGRESS = if ($env:MARKET_ALERT_PROGRESS) { $env:MARKET_ALERT_PROGRESS } else { "true" }
$env:MARKET_ALERT_POLL_MS = if ($env:MARKET_ALERT_POLL_MS) { $env:MARKET_ALERT_POLL_MS } else { "120000" }
$env:MRKT_BANNED_COOLDOWN_MS = if ($env:MRKT_BANNED_COOLDOWN_MS) { $env:MRKT_BANNED_COOLDOWN_MS } else { "600000" }
$env:MRKT_SCAN_BY_BACKDROP = if ($env:MRKT_SCAN_BY_BACKDROP) { $env:MRKT_SCAN_BY_BACKDROP } else { "true" }
$env:MARKET_ALERT_MIN_BACKGROUND_SCORE = if ($env:MARKET_ALERT_MIN_BACKGROUND_SCORE) { $env:MARKET_ALERT_MIN_BACKGROUND_SCORE } else { "50" }
$env:MRKT_TARGET_COLLECTIONS = if ($env:MRKT_TARGET_COLLECTIONS) { $env:MRKT_TARGET_COLLECTIONS } else { "Heroic Helmet,Heart Locket,Xmas Stocking,Instant Ramen,Lol Pop,B-Day Candle,Plush Pepe,Precious Peach,Durov's Cap,Toy Bear,Neko Helmet,Loot Bag" }
$env:MRKT_TARGET_BACKGROUNDS = if ($env:MRKT_TARGET_BACKGROUNDS) { $env:MRKT_TARGET_BACKGROUNDS } else { "Black,White,Platinum,Silver,Electric Purple,Cyberpunk,Electric Indigo,Neon Blue,Azure Blue,Sapphire,Sky Blue,Mint Green,Emerald,Malachite,Aquamarine,Pacific Green,Lavender,Purple,Violet,Gold,Pure Gold,Satin Gold,Ruby,Crimson,Fuchsia,Magenta" }

Remove-Item Env:\MARKET_ALERT_DRY_RUN -ErrorAction SilentlyContinue
Remove-Item Env:\MRKT_TARGET_COLLECTIONS -ErrorAction SilentlyContinue
Remove-Item Env:\MRKT_TARGET_BACKGROUNDS -ErrorAction SilentlyContinue

npm.cmd --workspace @mrkt/api run alerts:poll
