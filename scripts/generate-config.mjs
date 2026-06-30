import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const requiredKeys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_STORAGE_BUCKET"
];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET,
  publicSiteUrl: (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "")
};

const outputPath = resolve("lib/config.js");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `window.CHANTIERPROOF_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

console.log("Generated lib/config.js from environment variables");
