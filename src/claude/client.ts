import { readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Transaction } from "../types.js";

// Set to true to skip the API call and parse from sample-response.json instead (saves money while debugging).
const SKIP_ANTHROPIC_API = false;
const SAMPLE_RESPONSE_FILE = "sample-response.json";
const DEBUG_FILE = "julius-parse-error.txt";

// Resolve relative to this file so paths work when Claude Desktop runs from a different cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const CATEGORIES =
  "Income, Donations, Transportation, Groceries/Food, Insurance/Bills, Entertainment, Misc. Fun Money Expense, Fun Money Interest, Emergency Expense, Jaden's Allowance, Cristina's Allowance, Transfer From Fun-Money, Outstanding Fun-Money from Previous Month";

const EXTRACTION_PROMPT = `Extract all transactions from this bank statement PDF. Include both Pending Transactions and Posted Transactions.

For each transaction, return a JSON object with:
- date: string (format as "Mmm-D" e.g. "Feb-10" for the spreadsheet)
- category: string - MUST be exactly one of: ${CATEGORIES}. If unsure, leave category as empty string "".
- description: string - the transaction description from the statement. Escape special characters: use \\\\" for double quotes, use \\\\n for newlines, and avoid raw apostrophes or newlines inside the string so the JSON is valid.
- amount: number - the amount (positive for all amounts. Never input a negative amount.)
- needsReview: boolean (optional) - set to true if the transaction is suspicious or you cannot figure out the category; in that case fill only date, description, and amount, leave Category empty

Return ONLY a valid JSON array of transactions. No other text, no markdown, no code blocks, no preamble. In description and category fields, escape all quotes and newlines so the JSON parses correctly. Start your response with [ and end with ]. Example:
[{"date":"Feb-10","category":"Groceries/Food","description":"COSTCO WHSE","amount":-5.51},{"date":"Feb-9","category":"","description":"","amount":-2.24,"needsReview":true}]`;

export async function extractTransactions(
  pdfBase64: string,
  apiKey: string,
): Promise<Transaction[]> {
  let text: string;

  if (SKIP_ANTHROPIC_API) {
    // Read from local file instead of calling the API (for free debugging).
    const samplePath = join(PROJECT_ROOT, SAMPLE_RESPONSE_FILE);
    try {
      text = await readFile(samplePath, "utf-8");
    } catch {
      throw new Error(
        `SKIP_ANTHROPIC_API is true but ${SAMPLE_RESPONSE_FILE} not found at ${samplePath}. Paste the raw API response (or the JSON array) there to test parsing without spending money.`,
      );
    }
  } else {
    const body = {
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((b) => b.type === "text");
    text = textBlock?.text?.trim() ?? "";
    if (!text) {
      throw new Error("No extraction result from Claude");
    }
  }

  // Claude may wrap JSON in markdown code blocks
  let jsonStr = text.trim();
  const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    jsonStr = codeMatch[1].trim();
  }

  // Extract JSON array: find first [ and last ] so preamble/trailing text doesn't break parse
  const firstBracket = jsonStr.indexOf("[");
  const lastBracket = jsonStr.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
  }

  // Strip control characters (except newline and tab) that can break JSON when inside strings
  jsonStr = jsonStr.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");

  // Always log what will be parsed to the debug file (so you can inspect it without spending money)
  const debugPath = join(PROJECT_ROOT, DEBUG_FILE);
  await writeFile(debugPath, jsonStr, "utf-8");

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON array of transactions");
    }
    return parsed.map((t: unknown) => {
      const obj = t as Record<string, unknown>;
      return {
        date: String(obj.date ?? ""),
        category: String(obj.category ?? ""),
        description: String(obj.description ?? ""),
        amount: Number(obj.amount ?? 0),
        needsReview: Boolean(obj.needsReview),
      };
    });
  } catch (err) {
    const snippet =
      jsonStr.length > 500 ? jsonStr.slice(0, 500) + "..." : jsonStr;
    console.error("[Julius] Raw response (first 500 chars):", snippet);
    if (err instanceof SyntaxError) {
      throw new Error(
        `Failed to parse as JSON: ${err.message}. Full response saved to ${debugPath} for inspection.`,
      );
    }
    throw err;
  }
}
