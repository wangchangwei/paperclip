#!/usr/bin/env node

const DEFAULT_API_BASE = "http://127.0.0.1:3101/api";

function usage() {
  return `Usage:
  pnpm plane:sync-to-paperclip -- --company-id <paperclip-company-id> --agent-id <paperclip-agent-id> --connection-id <plane-tool-connection-id> [options]

Options:
  --api-base <url>       Paperclip API base URL. Default: ${DEFAULT_API_BASE}
  --project-id <uuid>    Plane project UUID to sync from. Omit to sync workspace-wide.
  --workspace-slug <s>   Plane workspace slug for origin fingerprints. Default: PLANE_WORKSPACE_SLUG or "workspace".
  --per-page <n>         Plane page size. Default: 25
  --limit <n>            Max Plane work items to publish. Default: 25
  --dry-run              Print planned creates/updates without writing Paperclip issues.
  --update-existing      Patch title/description/priority when an issue already exists.
  --status <status>      Paperclip issue status for new issues. Default: backlog

Environment fallbacks:
  PAPERCLIP_API_BASE, PAPERCLIP_COMPANY_ID, PAPERCLIP_PLANE_AGENT_ID, PAPERCLIP_PLANE_CONNECTION_ID, PLANE_PROJECT_ID, PLANE_WORKSPACE_SLUG
`;
}

function parseArgs(argv) {
  const args = {
    apiBase: process.env.PAPERCLIP_API_BASE ?? DEFAULT_API_BASE,
    companyId: process.env.PAPERCLIP_COMPANY_ID,
    agentId: process.env.PAPERCLIP_PLANE_AGENT_ID,
    connectionId: process.env.PAPERCLIP_PLANE_CONNECTION_ID,
    projectId: process.env.PLANE_PROJECT_ID,
    workspaceSlug: process.env.PLANE_WORKSPACE_SLUG ?? "workspace",
    perPage: 25,
    limit: 25,
    dryRun: false,
    updateExisting: false,
    status: "backlog",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    switch (arg) {
      case "--":
        break;
      case "--api-base":
        args.apiBase = next();
        break;
      case "--company-id":
        args.companyId = next();
        break;
      case "--agent-id":
        args.agentId = next();
        break;
      case "--connection-id":
        args.connectionId = next();
        break;
      case "--project-id":
        args.projectId = next();
        break;
      case "--workspace-slug":
        args.workspaceSlug = next();
        break;
      case "--per-page":
        args.perPage = Number.parseInt(next(), 10);
        break;
      case "--limit":
        args.limit = Number.parseInt(next(), 10);
        break;
      case "--status":
        args.status = next();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--update-existing":
        args.updateExisting = true;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.companyId) throw new Error("Missing --company-id or PAPERCLIP_COMPANY_ID");
  if (!args.agentId) throw new Error("Missing --agent-id or PAPERCLIP_PLANE_AGENT_ID");
  if (!args.connectionId) throw new Error("Missing --connection-id or PAPERCLIP_PLANE_CONNECTION_ID");
  if (!Number.isInteger(args.perPage) || args.perPage <= 0 || args.perPage > 100) {
    throw new Error("--per-page must be an integer from 1 to 100");
  }
  if (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 100) {
    throw new Error("--limit must be an integer from 1 to 100");
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const response = await fetch(`${args.apiBase}/companies/${args.companyId}/integrations/plane/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId: args.connectionId,
      agentId: args.agentId,
      projectId: args.projectId ?? null,
      workspaceSlug: args.workspaceSlug,
      perPage: args.perPage,
      limit: args.limit,
      status: args.status,
      updateExisting: args.updateExisting,
      dryRun: args.dryRun,
    }),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error ?? text ?? `Plane sync failed with ${response.status}`);
  }
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  console.error("");
  console.error(usage());
  process.exit(1);
});
