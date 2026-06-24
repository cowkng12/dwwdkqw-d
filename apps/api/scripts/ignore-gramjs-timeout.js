function isGramJsTimeout(error) {
  const message = String(error?.message ?? error ?? "");
  const stack = String(error?.stack ?? "").replaceAll("\\", "/");

  return message === "TIMEOUT" && stack.includes("telegram/client/updates.js");
}

export function ignoreGramJsTimeout() {
  const originalConsoleError = console.error;

  console.error = (...args) => {
    const text = args.map((arg) => String(arg?.stack ?? arg?.message ?? arg)).join("\n");

    if (text.includes("Error: TIMEOUT") && text.replaceAll("\\", "/").includes("telegram/client/updates.js")) {
      return;
    }

    originalConsoleError(...args);
  };

  process.on("unhandledRejection", (error) => {
    if (!isGramJsTimeout(error)) {
      console.error(error?.message || error);
    }
  });

  process.on("uncaughtException", (error) => {
    if (!isGramJsTimeout(error)) {
      console.error(error?.message || error);
      process.exitCode = 1;
    }
  });
}
