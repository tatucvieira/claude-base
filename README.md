# claude-base

Base template for Claude Code sessions. Contains reusable skills, workflows, and configurations.

## What's included

### Slash Commands (Skills)

| Command | Description |
|---------|-------------|
| `/deploy-railway [name] [dir]` | Deploy any app to Railway via GitHub Actions |
| `/railway-status` | Check Railway projects, services, domains |

### GitHub Actions Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `railway-deploy-action.yml` | `workflow_dispatch` | Creates Railway project, service, domain via GraphQL API |

## Setup

### 1. Use as template
Create a new repo from this template, or copy the files you need into your project.

### 2. Add secrets
Go to your repo → Settings → Secrets → Actions, and add:

| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `RAILWAY_TOKEN` | Railway API token | https://railway.com/account/tokens |

### 3. Use the skills
```
/deploy-railway my-app-name subdirectory/
/railway-status
```

## Architecture

```
Claude Code (no internet) → gh workflow run → GitHub Actions (has internet + secrets) → Railway API → Reports via GitHub Issues
```

Claude Code web environments have no direct internet access. All external API calls are proxied through GitHub Actions, which have access to secrets and the internet.

## Adding new skills

1. Create a `.md` file in `.claude/commands/`
2. If the skill needs external APIs, create a matching workflow in `.github/workflows/`
3. Document in `skills/[name]/README.md`
