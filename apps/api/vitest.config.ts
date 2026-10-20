import { defineConfig } from "vitest/config";

// Tests share one database, so files run one at a time.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20_000 } });
