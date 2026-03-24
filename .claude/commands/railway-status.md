# Railway Status & Management

Check status and manage Railway deployments via GitHub Actions.

## How it works

This environment has NO direct internet access. Use GitHub Actions workflows to interact with Railway API. The `RAILWAY_TOKEN` is stored as a GitHub Secret.

## Input: $ARGUMENTS

The user can pass a command (default: "status"):
- `status` — List all projects, services, and domains
- `delete PROJECT_NAME` — Delete a project (ask confirmation first!)

## Steps

### For `status`:

1. Trigger the status workflow:
```bash
gh workflow run "Railway Status" --repo OWNER/REPO
```

2. Wait for completion and read the issue it creates.

### For `delete`:

1. Trigger with project name:
```bash
gh workflow run "Railway Status" --repo OWNER/REPO -f action="delete" -f project_name="NAME"
```

2. **ALWAYS ask the user for confirmation before triggering delete.**

## Workflow

If `.github/workflows/railway-status-action.yml` doesn't exist, create it:

```yaml
name: Railway Status

on:
  workflow_dispatch:
    inputs:
      action:
        description: 'Action: status or delete'
        required: false
        default: 'status'
      project_name:
        description: 'Project name (for delete)'
        required: false
        default: ''

permissions:
  issues: write
  contents: read

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Railway API
        run: |
          API="https://backboard.railway.app/graphql/v2"
          TOKEN="$RAILWAY_TOKEN"
          ACTION="${{ github.event.inputs.action }}"
          PROJECT_NAME="${{ github.event.inputs.project_name }}"

          gql() {
            curl -s -X POST "$API" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d "{\"query\": \"$1\"}"
          }

          if [ "$ACTION" = "status" ]; then
            RESULT=$(gql "{ projects { edges { node { id name services { edges { node { id name serviceInstances { edges { node { domains { serviceDomains { domain } } } } } } } } } } } }")
            echo "$RESULT" | jq '.' > /tmp/report.json
            echo "## Railway Projects" > /tmp/report.txt
            echo '```json' >> /tmp/report.txt
            cat /tmp/report.json >> /tmp/report.txt
            echo '```' >> /tmp/report.txt

          elif [ "$ACTION" = "delete" ]; then
            PROJECTS=$(gql "{ projects { edges { node { id name } } } }")
            PROJECT_ID=$(echo "$PROJECTS" | jq -r ".data.projects.edges[] | select(.node.name == \"$PROJECT_NAME\") | .node.id // empty")
            if [ -n "$PROJECT_ID" ]; then
              gql "mutation { projectDelete(id: \\\"$PROJECT_ID\\\") }"
              echo "## Deleted\nProject $PROJECT_NAME ($PROJECT_ID) deleted." > /tmp/report.txt
            else
              echo "## Not Found\nProject '$PROJECT_NAME' not found." > /tmp/report.txt
            fi
          fi
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Report
        if: always()
        run: |
          REPORT=$(cat /tmp/report.txt 2>/dev/null || echo "No report")
          gh issue create \
            --title "Railway ${{ github.event.inputs.action }}: $(date -u +%H:%M)" \
            --body "$REPORT" \
            --repo ${{ github.repository }}
        env:
          GH_TOKEN: ${{ github.token }}
```
