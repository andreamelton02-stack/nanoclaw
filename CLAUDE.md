# NanoClaw (Jeeves)

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## OAuth Lock (Jeeves = Andrea)  read before any Google-auth claim

Jeeves is **connected to Google via OAuth**.  The GCP project is **jeeves-490713** (project number `501488433537`), owner `andrea.melton02@gmail.com`, **PUBLISHED to production 2026-04-16**.  Refresh tokens are **indefinite**.  Do NOT raise the "7-day testing-mode expiry" hypothesis ever again.

Identifier: every Jeeves `gcp-oauth.keys.json` has `client_id` starting with **`501...`**.  That is the only authoritative ownership signal.

**Contamination warning:** the `project_id` STRING inside Jeeves's `gcp-oauth.keys.json` literally reads `bubbly-mantis-488216-k1`.  This is wrong, inherited from a template-copy of Jon's keys file when Jeeves was set up.  **Ignore that field entirely.**  Jeeves's `client_id` (501...) correctly authenticates to `jeeves-490713`.  Jon has corrected this drift 50+ times.  Do not say "Jeeves is on bubbly-mantis."  Bubbly-mantis is Jon's project, period.

Credential paths (host) - all three live at `~/`:
- Gmail: `~/.gmail-mcp-andrea/` (referenced by `GMAIL_CREDENTIALS_DIR=/home/melto007/.gmail-mcp-andrea` in `.env`; forwarded into container by `src/container-runner.ts` lines ~193-198)
- Calendar: `~/.calendar-mcp-andrea/` (legacy host-home path; **not actually read by the bot**)
- Drive: `~/.drive-mcp-andrea/`

Credential paths (the ones the container actually reads via `HOME=/workspace/group` resolution in the calendar MCP subprocess):
- Calendar: `~/nanoclaw-jeeves/groups/telegram_main/.calendar-mcp/credentials.json` <- THIS is the one that matters for calendar.
- Gmail: container reads via the `GMAIL_CREDENTIALS_DIR` env injection, not via `HOME` resolution.

### Hard rules

1.  Never `cp` between `~/.{gmail,calendar,drive}-mcp-andrea/` and `~/.{gmail,calendar,drive}-mcp/`.  Power Glove is a separate bot in a separate container with a separate Google account (jonsmelton@gmail.com, project 523151035551).  Cross-bot ops blocked by the PreToolUse hook at `~/.claude/hooks/oauth-guard.sh`.
2.  The only verified-working Calendar reauth helper is `scripts/auth-jeeves-calendar.cjs` (port 3777, login_hint=andrea.melton02@gmail.com, identity check).  Do not run it unless `invalid_grant` is verified by curl against `https://oauth2.googleapis.com/token` with the actual refresh_token.
3.  Never edit `credentials.json` or `gcp-oauth.keys.json` directly.  The hook will surface a confirmation prompt if you try.
4.  Cross-bot file copy is forbidden.  No exceptions, even with confirmation.  Jon has stated this directly multiple times.

### When Google integration looks broken

Read in this order: this section, then `~/.claude/projects/-home-melto007/memory/project_gmail_publish_app.md` (diagnostic curl + canonical mapping), then `project_calendar_oauth_setup_pattern.md`.  Only then form a hypothesis.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Secrets / Credentials / Proxy (OneCLI)

Upstream nanoclaw uses an OneCLI gateway for secret injection.  Jeeves inherits that text from upstream, but **Google OAuth credentials are NOT routed through OneCLI** -- they live as files on disk per the "OAuth Lock" section above.  When in doubt about a Google integration, the answer is in OAuth Lock, not OneCLI.

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/migrate-nanoclaw` | Major version bumps (1.x → 2.x).  Replays customizations on clean upstream. |
| `/init-onecli` | Install OneCLI Agent Vault and migrate `.env` credentials to it |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

**Major-version upgrades MUST use `/migrate-nanoclaw`, not `git merge upstream/main`** -- the architectural rewrite makes a 3-way merge meaningless and destroys customizations.

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
