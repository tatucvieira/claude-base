# SKILL: Microsoft 365 Integration

**Maturity:** L0 — Setup
**Created:** 2026-02-14
**Last Used:** Never
**Times Used:** 0
**Success Rate:** N/A

---

## What This Skill Does

Reads and manages Microsoft 365 email (Outlook) via MCP server, enabling email triage, search, drafting, and context gathering without leaving Claude Code.

## Status

**Pending authentication.** MCP server configured (`.mcp.json`), awaiting first login after session restart.

## Setup

### MCP Server
- **Server:** `@softeria/ms-365-mcp-server` (Softeria, 461+ stars, MIT)
- **Mode:** `--org-mode` (work/school account) + `--preset mail` (email tools only)
- **Config:** `.mcp.json` at project root

### Authentication Flow
1. Restart Claude Code session (so MCP server loads)
2. Use `login` tool — returns a device code + URL
3. Open URL in browser, enter code, grant consent
4. Use `verify-login` tool to confirm
5. Token cached automatically for future sessions

### If "Admin Approval Required" Error
Tenant blocks third-party app consent. Fallback options:
1. **IMAP + app password** — generate at mysignins.microsoft.com/security-info, use IMAP client
2. **IT request** — see `IT_REQUEST.md` in this directory for a ready-to-forward template

## Available Tools (once authenticated)
| Tool | What it does |
|------|-------------|
| `list-mail-messages` | List recent emails |
| `list-mail-folders` | List mail folders |
| `list-mail-folder-messages` | List messages in a specific folder |
| `get-mail-message` | Read a specific email |
| `send-mail` | Send email |
| `create-draft-email` | Create draft |
| `move-mail-message` | Move message between folders |
| `delete-mail-message` | Delete email |

## Advancement Criteria
- **-> L1:** First successful login + email read
- **-> L2:** Used for email triage in 3+ sessions
- **-> L3:** Integrated into daily workflow (briefings, follow-ups)
- **-> L4:** Proactive email intelligence (flag urgent items, surface patterns)

---

## Usage Log
| Date | Action | Outcome | Notes |
|------|--------|---------|-------|
| 2026-02-14 | MCP config created | Pending restart | Using built-in client ID, org-mode |
