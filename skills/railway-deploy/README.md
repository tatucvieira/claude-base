# Railway Deploy Skill

**Maturity:** L2 (Practiced)
**Last used:** 2026-03-24

## What it does

Deploys any application to Railway via GitHub Actions + Railway GraphQL API v2. Works in environments without internet access (like Claude Code web) because all API calls happen inside GitHub Actions runners.

## Architecture

```
Claude Code (no internet) → triggers GitHub Actions → calls Railway GraphQL API → reports via GitHub Issues
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/deploy-railway [name] [dir]` | Create project, service, set vars, generate domain |
| `/railway-status` | Check all projects, services, domains |

## Prerequisites

1. **Railway account** at https://railway.com
2. **API Token** stored as GitHub Secret `RAILWAY_TOKEN`
   - Create token at https://railway.com/account/tokens (scope to workspace)
   - Add to repo: Settings → Secrets → Actions → New secret → `RAILWAY_TOKEN`

## Key Files

- `.claude/commands/deploy-railway.md` — slash command definition
- `.claude/commands/railway-status.md` — status command definition
- `.github/workflows/railway-deploy-action.yml` — reusable deploy workflow

## Lessons Learned

- Claude Code web environment has NO direct internet access — must use GitHub Actions as proxy
- `settings.local.json` does NOT persist between web sessions — use GitHub Secrets instead
- Railway CLI often fails with workspace tokens — GraphQL API is more reliable
- The `me` query doesn't work with workspace-scoped tokens — use `projects` query instead
- Always set `PORT=8080` and `RAILWAY_ROOT_DIRECTORY` for monorepo subdirectories
