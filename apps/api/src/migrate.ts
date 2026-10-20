import { config } from "./config.js";
import { runMigrations } from "./db/index.js";

await runMigrations(config.databaseUrl);
console.log("migrations applied");
