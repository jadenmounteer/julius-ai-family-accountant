import { config as loadEnv } from "dotenv";

loadEnv();

export interface Config {
  anthropicApiKey: string;
  spreadsheetId: string;
  googleClientId: string;
  googleClientSecret: string;
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    anthropicApiKey: getEnv("ANTHROPIC_API_KEY"),
    spreadsheetId: getEnv("SPREADSHEET_ID"),
    googleClientId: getEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
  };
}
