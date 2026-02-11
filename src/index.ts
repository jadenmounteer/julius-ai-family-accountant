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
      "Process a bank statement PDF and append extracted transactions to the family budget Google Sheet for the current month. Accepts either (1) a local filesystem path the user provides (e.g. /Users/jadenmounteer/Documents/statement.pdf) or (2) the path to a file uploaded in this chat (e.g. /mnt/user-data/uploads/filename.pdf). Note: If SKIP_ANTHROPIC_API is true, the API will not be called and the transactions will be parsed from the sample-response.json file found that the root of this repo.",
    inputSchema: {
      file_path: z
        .string()
        .describe(
          "Full path to the bank statement PDF: either a local filesystem path the user mentions (e.g. /Users/jadenmounteer/Documents/statement.pdf) or an uploaded-file path like /mnt/user-data/uploads/filename.pdf. Use the path the user specifies; don't insist on an upload if a valid path is already given.",
        ),
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
