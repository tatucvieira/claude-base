# IT Request: Azure AD App Registration for Microsoft 365 MCP Integration

> Ready-to-forward template. Only needed if the built-in client ID is blocked by tenant policy.

---

**Subject:** Request: Azure AD App Registration — Microsoft Graph API (Delegated, Read-Only)

**To:** IT / Identity & Access Management

**Priority:** Medium

---

## What I need

An Azure AD App Registration so I can connect a local development tool (MCP server) to my own Microsoft 365 mailbox.

## App Details

| Field | Value |
|-------|-------|
| **App name** | `ms365-mcp-cosbot` (or any name per your naming convention) |
| **Supported account types** | Single tenant (this organization only) |
| **Platform** | Mobile and desktop applications |
| **Redirect URI** | `https://login.microsoftonline.com/common/oauth2/nativeclient` |
| **Allow public client flows** | Yes (required for device code auth) |
| **Client secret** | Not required |

## Required API Permissions (Delegated only — no application permissions)

| API | Permission | Type | Why |
|-----|-----------|------|-----|
| Microsoft Graph | `Mail.Read` | Delegated | Read my emails |
| Microsoft Graph | `Mail.ReadWrite` | Delegated | Move/organize emails |
| Microsoft Graph | `Mail.Send` | Delegated | Send emails on my behalf |
| Microsoft Graph | `User.Read` | Delegated | Basic profile (required by Graph) |

**Note:** These are all *delegated* permissions — the app can only access *my own* mailbox, authenticated as me. No admin-level or application-wide access.

## What I'll receive back

Please provide:
1. **Application (client) ID**
2. **Tenant ID** (or confirm it's the default org tenant)

No client secret needed.

## Security Notes
- Device code flow only (interactive browser authentication)
- Token cached locally on my machine
- No server-side components
- Open source tool: https://github.com/Softeria/ms-365-mcp-server (MIT license)
