#!/usr/bin/env node
/**
 * Jeeves-only Google Calendar OAuth bootstrap.
 *
 * Writes credentials.json into the per-group calendar dir
 * (~/nanoclaw-jeeves/groups/telegram_main/.calendar-mcp/),
 * which the container reads via HOME=/workspace/group.
 *
 * NEVER touches ~/.calendar-mcp/ (Jon) or ~/.calendar-mcp-andrea/ (legacy).
 *
 * Run on host: node scripts/auth-jeeves-calendar.cjs
 * Browser interaction required at localhost:3777/oauth2callback.
 * Port 3777 chosen to avoid Jon's 3000-3010 dev range and 8000-range firefly stuff.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(PROJECT_ROOT, "groups", "telegram_main", ".calendar-mcp");
const OAUTH_PATH = path.join(CONFIG_DIR, "gcp-oauth.keys.json");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");
const PORT = 3777;

if (!fs.existsSync(OAUTH_PATH)) {
  console.error(`Missing OAuth keys: ${OAUTH_PATH}`);
  process.exit(1);
}

const keysContent = JSON.parse(fs.readFileSync(OAUTH_PATH, "utf8"));
const keys = keysContent.installed || keysContent.web;
if (!keys) {
  console.error("Invalid OAuth keys file format.");
  process.exit(1);
}

console.log(`Using OAuth client: ${keys.client_id.split("-")[0]}...`);
console.log(`Will write credentials to: ${CREDENTIALS_PATH}`);

const oauth2Client = new google.auth.OAuth2(
  keys.client_id,
  keys.client_secret,
  `http://localhost:${PORT}/oauth2callback`
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "select_account consent",
  login_hint: "andrea.melton02@gmail.com",
  scope: ["https://www.googleapis.com/auth/calendar"],
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) return;
  const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get("code");
  if (!code) {
    res.end("No code received.");
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Verify the authenticated user is actually Andrea before saving.
    oauth2Client.setCredentials(tokens);
    const profileResp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResp.json();
    if (profile.id !== "andrea.melton02@gmail.com") {
      const msg = `REJECTED: OAuth completed as ${profile.id}, not andrea.melton02@gmail.com.  Token NOT saved.  Re-run and select Andrea's account.`;
      res.end(msg);
      console.error("\n" + msg);
      server.close();
      process.exit(1);
    }

    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens, null, 2));
    res.end(`Done.  Andrea's (${profile.id}) calendar credentials saved.  You can close this tab.`);
    console.log(`\nCredentials saved to ${CREDENTIALS_PATH}`);
    console.log(`Authenticated user: ${profile.id}`);
    console.log(`Scope: ${tokens.scope}`);
    console.log(`\nNext: rebuild Jeeves container image, then test.`);
    server.close();
  } catch (err) {
    res.end("Error: " + err.message);
    console.error(err);
  }
});

server.listen(PORT, () => {
  console.log(`\nOpen this URL in your browser (sign in as Andrea):\n\n${authUrl}\n`);
});
