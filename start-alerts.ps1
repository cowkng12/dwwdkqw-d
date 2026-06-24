$env:MONOCHROME_MAX_PRICE = if ($env:MONOCHROME_MAX_PRICE) { $env:MONOCHROME_MAX_PRICE } else { "6" }
$env:MARKET_ALERT_MAX_PER_SCAN = if ($env:MARKET_ALERT_MAX_PER_SCAN) { $env:MARKET_ALERT_MAX_PER_SCAN } else { "5" }
$env:MARKET_ALERT_PROGRESS = if ($env:MARKET_ALERT_PROGRESS) { $env:MARKET_ALERT_PROGRESS } else { "true" }
$env:MARKET_ALERT_POLL_MS = if ($env:MARKET_ALERT_POLL_MS) { $env:MARKET_ALERT_POLL_MS } else { "120000" }
$env:MRKT_BANNED_COOLDOWN_MS = if ($env:MRKT_BANNED_COOLDOWN_MS) { $env:MRKT_BANNED_COOLDOWN_MS } else { "600000" }

Remove-Item Env:\MARKET_ALERT_DRY_RUN -ErrorAction SilentlyContinue
Remove-Item Env:\MRKT_TARGET_COLLECTIONS -ErrorAction SilentlyContinue
Remove-Item Env:\MRKT_TARGET_BACKGROUNDS -ErrorAction SilentlyContinue

npm.cmd --workspace @mrkt/api run alerts:poll
