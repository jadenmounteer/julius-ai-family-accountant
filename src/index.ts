import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { extract } from "./pdf/extractor.js";
import { extractTransactions } from "./claude/client.js";
import { appendRows } from "./sheets/client.js";

const server = new McpServer({
  name: "julius",
  version: "1.0.0",
});

function getCurrentMonthSheetName(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

server.registerTool(
  "process_statement",
  {
    description:
      "Process a bank statement PDF and append extracted transactions to the family budget Google Sheet for the current month. Accepts a local filesystem path (e.g. /Users/jadenmounteer/Documents/statement.pdf) provided by the user",
    inputSchema: {
      file_path: z.string().describe("Path to the bank statement PDF file"),
    },
  },
  async ({ file_path }) => {
    try {
      const config = loadConfig();
      const sheetName = getCurrentMonthSheetName();

      const { base64 } = await extract(file_path);
      const transactions = await extractTransactions(
        base64,
        config.anthropicApiKey,
      );
      await appendRows(config, sheetName, transactions);

      const needsReview = transactions.filter((t) => t.needsReview);
      let message = `Successfully added ${transactions.length} transaction(s) to the "${sheetName}" tab.`;
      if (needsReview.length > 0) {
        message += `\n\n${needsReview.length} transaction(s) need review (category/description left blank):`;
        needsReview.forEach((t) => {
          message += `\n- ${t.date}: $${t.amount}`;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${message}`,
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Julius MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
