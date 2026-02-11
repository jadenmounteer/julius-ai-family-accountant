import { createServer } from "http";
import open from "open";
import { writeFile } from "fs/promises";
import { join } from "path";
import { config as loadEnv } from "dotenv";
import { google } from "googleapis";

loadEnv();

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = join(process.cwd(), "token.json");

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Add them to .env");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("Opening browser for Google sign-in...");
  console.log("If the browser doesn't open, visit this URL manually:\n", authUrl);

  // Open browser
  try {
    await open(authUrl);
  } catch {
    // open() may fail in some environments
  }

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/oauth2callback") {
        const codeParam = url.searchParams.get("code");
        if (codeParam) {
          server.close();
          resolve(codeParam);
        } else {
          reject(new Error("No code in callback"));
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Success!</h1><p>You can close this window and return to the terminal.</p></body></html>"
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(3000, "localhost", () => {
      console.log("Listening on http://localhost:3000");
    });

    server.on("error", reject);
  });

  const { tokens } = await oauth2Client.getToken(code);
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Tokens saved to ${TOKEN_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
