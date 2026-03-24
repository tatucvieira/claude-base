# Deploy to Railway

You are a deployment assistant. Deploy the current project (or a subdirectory) to Railway.

## How it works

This environment has NO direct internet access. All Railway API calls run via **GitHub Actions**, which has access to the `RAILWAY_TOKEN` stored as a GitHub Secret.

The workflow `.github/workflows/railway-deploy-action.yml` does the actual work. You trigger it, wait for results, and report back.

## Input: $ARGUMENTS

The user may provide arguments like:
- Project name (default: current repo name)
- Subdirectory to deploy (default: repo root)
- Example: `/deploy-railway shopping-list shopping-list/` → project name "shopping-list", root dir "shopping-list"

Parse the arguments: first word = project name, second word = root directory (optional).

## Prerequisites

1. `RAILWAY_TOKEN` must exist as a GitHub Secret in the repo
2. If not, tell the user:
   > Add your Railway token as a GitHub Secret:
   > 1. Go to your repo → Settings → Secrets and variables → Actions
   > 2. Add secret named `RAILWAY_TOKEN` with your token from https://railway.com/account/tokens

## Deployment Steps

### Step 1: Detect the GitHub repo
```bash
git remote -v  # find OWNER/REPO
```

### Step 2: Trigger the deploy workflow
```bash
gh workflow run "Railway Deploy" \
  --repo OWNER/REPO \
  -f project_name="PROJECT_NAME" \
  -f root_directory="ROOT_DIR" \
  -f github_repo="OWNER/REPO"
```

### Step 3: Wait for completion
Poll the workflow run status:
```bash
# Get the latest run ID
gh run list --repo OWNER/REPO --workflow "railway-deploy-action.yml" --limit 1 --json databaseId,status

# Wait for it
gh run watch RUN_ID --repo OWNER/REPO
```

### Step 4: Read the result
The workflow creates a GitHub Issue with the full report. Read the latest issue:
```bash
gh api repos/OWNER/REPO/issues --jq '.[0] | {title, body}'
```

### Step 5: Report to user
Parse the issue body and present a clean summary:
```
Railway Deploy Complete
   Project:  PROJECT_NAME
   Domain:   https://DOMAIN
   Status:   Building from GitHub repo
```

## Error Handling

- If workflow fails, read the logs: `gh run view RUN_ID --repo OWNER/REPO --log`
- If "RAILWAY_TOKEN" secret is missing, guide user to add it
- If project name conflicts, suggest a different name
- If `railway-deploy-action.yml` doesn't exist, create it (see template below)

## Workflow Template

If `.github/workflows/railway-deploy-action.yml` doesn't exist, create it with this content:

```yaml
name: Railway Deploy

on:
  workflow_dispatch:
    inputs:
      project_name:
        description: 'Railway project name'
        required: true
      root_directory:
        description: 'Root directory to deploy (leave empty for repo root)'
        required: false
        default: ''
      github_repo:
        description: 'GitHub repo (owner/name)'
        required: true

permissions:
  issues: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Railway via GraphQL API
        run: |
          set +e
          API="https://backboard.railway.app/graphql/v2"
          TOKEN="$RAILWAY_TOKEN"
          PROJECT_NAME="${{ github.event.inputs.project_name }}"
          ROOT_DIR="${{ github.event.inputs.root_directory }}"
          GITHUB_REPO="${{ github.event.inputs.github_repo }}"
          REPORT=""

          gql() {
            curl -s -X POST "$API" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d "{\"query\": \"$1\"}"
          }

          # Check existing projects
          PROJECTS=$(gql "{ projects { edges { node { id name } } } }")
          EXISTING_ID=$(echo "$PROJECTS" | jq -r ".data.projects.edges[] | select(.node.name == \"$PROJECT_NAME\") | .node.id // empty")

          if [ -n "$EXISTING_ID" ]; then
            PROJECT_ID="$EXISTING_ID"
            REPORT="## Project\nReusing existing: $PROJECT_NAME ($PROJECT_ID)\n\n"
          else
            CREATE=$(gql "mutation { projectCreate(input: { name: \\\"$PROJECT_NAME\\\" }) { id name } }")
            PROJECT_ID=$(echo "$CREATE" | jq -r '.data.projectCreate.id // empty')
            REPORT="## Project\nCreated: $PROJECT_NAME ($PROJECT_ID)\n\n"
          fi

          if [ -z "$PROJECT_ID" ]; then
            REPORT="## ERROR\nFailed to create/find project.\n\`\`\`json\n$PROJECTS\n$CREATE\n\`\`\`"
            echo -e "$REPORT" > /tmp/report.txt
            exit 0
          fi

          # Get environment
          ENV=$(gql "{ project(id: \\\"$PROJECT_ID\\\") { environments { edges { node { id name } } } } }")
          ENV_ID=$(echo "$ENV" | jq -r '.data.project.environments.edges[0].node.id // empty')

          # Check for existing service
          SERVICES=$(gql "{ project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }")
          SERVICE_ID=$(echo "$SERVICES" | jq -r '.data.project.services.edges[0].node.id // empty')

          if [ -z "$SERVICE_ID" ]; then
            SERVICE=$(gql "mutation { serviceCreate(input: { name: \\\"web\\\", projectId: \\\"$PROJECT_ID\\\", source: { repo: \\\"$GITHUB_REPO\\\" } }) { id name } }")
            SERVICE_ID=$(echo "$SERVICE" | jq -r '.data.serviceCreate.id // empty')
            REPORT="$REPORT## Service\nCreated: web ($SERVICE_ID)\n\n"
          else
            REPORT="$REPORT## Service\nReusing: $SERVICE_ID\n\n"
          fi

          # Set variables
          if [ -n "$ROOT_DIR" ]; then
            gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$SERVICE_ID\\\", name: \\\"RAILWAY_ROOT_DIRECTORY\\\", value: \\\"$ROOT_DIR\\\" }) }"
          fi
          gql "mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$SERVICE_ID\\\", name: \\\"PORT\\\", value: \\\"8080\\\" }) }"
          REPORT="$REPORT## Variables\nPORT=8080"
          [ -n "$ROOT_DIR" ] && REPORT="$REPORT, RAILWAY_ROOT_DIRECTORY=$ROOT_DIR"
          REPORT="$REPORT\n\n"

          # Generate domain
          DOMAIN=$(gql "mutation { serviceDomainCreate(input: { serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { domain } }")
          DOMAIN_URL=$(echo "$DOMAIN" | jq -r '.data.serviceDomainCreate.domain // empty')

          if [ -n "$DOMAIN_URL" ]; then
            REPORT="$REPORT## Domain\nhttps://$DOMAIN_URL\n"
          else
            # Maybe domain already exists
            REPORT="$REPORT## Domain\nAlready exists or failed: $DOMAIN\n"
          fi

          echo -e "$REPORT" > /tmp/report.txt
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Report results
        if: always()
        run: |
          REPORT=$(cat /tmp/report.txt 2>/dev/null || echo "No report generated")
          gh issue create \
            --title "Railway Deploy: ${{ github.event.inputs.project_name }} - $(date -u +%H:%M)" \
            --body "$REPORT" \
            --repo ${{ github.repository }}
        env:
          GH_TOKEN: ${{ github.token }}
```

## Important Notes

- NEVER ask the user to paste tokens in chat — always use GitHub Secrets
- The workflow creates an issue with results so we can read them
- Railway auto-deploys on push once the service is connected to the repo
