import "dotenv/config";
import { getMrktAuthToken } from "../src/market/auth.js";

async function main() {
  const token = await getMrktAuthToken();

  console.log("MRKT auth token received.");
  console.log(token);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
