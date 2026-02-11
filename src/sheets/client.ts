import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { Transaction } from "../types.js";
import type { Config } from "../config.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// Resolve relative to this file so token.json is found when Claude Desktop runs from a different cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const TOKEN_PATH = join(PROJECT_ROOT, "token.json");

function formatDateForSheet(dateStr: string): string {
  // Claude returns "Feb-10" or similar; pass through if already in that format
  const match = dateStr.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (match) return dateStr;
  // Try parsing MM/DD/YY format
  const parts = dateStr.split(/[/-]/);
  if (parts.length >= 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (month >= 1 && month <= 12) {
      return `${monthNames[month - 1]}-${day}`;
    }
  }
  return dateStr;
}

export async function getAuthenticatedClient(
  config: Config,
): Promise<OAuth2Client> {
  const { OAuth2Client } = await import("google-auth-library");

  const oauth2Client = new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    "http://localhost:3000/oauth2callback",
  );

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      "token.json not found. Run 'npm run auth' to authenticate with Google.",
    );
  }

  const tokenContent = await readFile(TOKEN_PATH, "utf-8");
  const tokens = JSON.parse(tokenContent);
  oauth2Client.setCredentials(tokens);

  return oauth2Client;
}

export async function appendRows(
  config: Config,
  sheetName: string,
  transactions: Transaction[],
): Promise<void> {
  const auth = await getAuthenticatedClient(config);
  const sheets = google.sheets({ version: "v4", auth });

  const values = transactions.map((t) => [
    formatDateForSheet(t.date),
    t.category,
    t.description,
    "", // Column D and E are empty because the description spans columns C, D, and E
    "",
    t.amount,
  ]);

  if (values.length === 0) {
    return;
  }

  const range = `'${sheetName}'!A:F`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}
