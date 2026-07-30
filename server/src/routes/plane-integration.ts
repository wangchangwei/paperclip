import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { z } from "zod";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { badRequest, forbidden } from "../errors.js";
import { getActorInfo, assertBoard, assertCompanyAccess } from "./authz.js";
import { issueService, logActivity } from "../services/index.js";
import type { ToolGatewayService } from "../services/tool-gateway.js";

const PLANE_WORK_ITEM_ORIGIN_KIND = "plane_work_item";

const syncPlaneWorkItemsSchema = z.object({
  connectionId: z.string().uuid(),
  agentId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  workspaceSlug: z.string().trim().min(1).max(160).default("workspace"),
  perPage: z.number().int().min(1).max(100).default(25),
  limit: z.number().int().min(1).max(100).default(25),
  status: z.enum(ISSUE_STATUSES).default("backlog"),
  updateExisting: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

type PlaneWorkItem = {
  id: string;
  name: string;
  sequence_id?: number | null;
  priority?: string | null;
  description_html?: string | null;
  target_date?: string | null;
};

function parseToolResult(result: unknown): unknown {
  const container = result && typeof result === "object" ? result as Record<string, unknown> : {};
  if (container.error && typeof container.error === "object") {
    const error = container.error as Record<string, unknown>;
    throw badRequest(typeof error.message === "string" ? error.message : "Plane MCP tool call failed");
  }
  if (typeof container.content === "string") return JSON.parse(container.content);
  if (Array.isArray(container.content)) {
    const text = container.content
      .map((entry) => entry && typeof entry === "object" && "text" in entry ? String((entry as { text?: unknown }).text ?? "") : "")
      .join("");
    return text ? JSON.parse(text) : {};
  }
  return result;
}

function htmlToText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function mapPriority(priority: string | null | undefined): typeof ISSUE_PRIORITIES[number] {
  const value = String(priority ?? "").toLowerCase();
  if (value === "urgent" || value === "high") return "high";
  if (value === "medium") return "medium";
  if (value === "low" || value === "none") return "low";
  return "medium";
}

function issueDescription(item: PlaneWorkItem) {
  const planeKey = item.sequence_id ? `#${item.sequence_id}` : item.id;
  return [
    htmlToText(item.description_html),
    "",
    "Imported from Plane.",
    `Plane work item: ${planeKey}`,
    `Plane work item id: ${item.id}`,
    item.target_date ? `Plane target date: ${item.target_date}` : null,
  ].filter(Boolean).join("\n");
}

async function existingPlaneIssue(db: Db, companyId: string, planeId: string) {
  return db
    .select()
    .from(issues)
    .where(and(
      eq(issues.companyId, companyId),
      eq(issues.originKind, PLANE_WORK_ITEM_ORIGIN_KIND),
      eq(issues.originId, planeId),
    ))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export function planeIntegrationRoutes(db: Db, options: { toolGateway: ToolGatewayService }) {
  const router = Router();
  const issuesSvc = issueService(db);

  router.post("/companies/:companyId/integrations/plane/sync", validate(syncPlaneWorkItemsSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const input = req.body as z.infer<typeof syncPlaneWorkItemsSchema>;
    const actor = getActorInfo(req);
    const results: Array<{
      action: "created" | "existing" | "updated" | "dry_run";
      planeId: string;
      issueId?: string;
      identifier?: string | null;
      title?: string;
    }> = [];

    const toolResult = await options.toolGateway.executeTestCall({
      companyId,
      connectionId: input.connectionId,
      agentId: input.agentId,
      userId: req.actor.userId ?? "board",
      toolName: "list_work_items",
      parameters: {
        project_id: input.projectId ?? undefined,
        per_page: Math.min(input.perPage, input.limit),
        order_by: "-created_at",
        fields: "id,name,sequence_id,priority,state,project,description_html,created_at,updated_at,target_date",
      },
    });

    if (toolResult.decision !== "allowed") {
      throw forbidden(`Plane list_work_items was not allowed: ${toolResult.decision}`);
    }
    if ("error" in toolResult) {
      throw badRequest(toolResult.error.message);
    }

    const parsed = parseToolResult(toolResult.result) as { results?: unknown[] };
    const workItems = (Array.isArray(parsed.results) ? parsed.results : [])
      .filter((item): item is PlaneWorkItem =>
        Boolean(item)
        && typeof item === "object"
        && typeof (item as PlaneWorkItem).id === "string"
        && typeof (item as PlaneWorkItem).name === "string"
      )
      .slice(0, input.limit);

    for (const item of workItems) {
      const description = issueDescription(item);
      const priority = mapPriority(item.priority);
      const existing = await existingPlaneIssue(db, companyId, item.id);

      if (input.dryRun) {
        results.push({ action: "dry_run", planeId: item.id, title: item.name });
        continue;
      }

      if (existing) {
        if (!input.updateExisting) {
          results.push({
            action: "existing",
            planeId: item.id,
            issueId: existing.id,
            identifier: existing.identifier,
          });
          continue;
        }
        const updated = await issuesSvc.update(existing.id, {
          title: item.name,
          description,
          priority,
        });
        if (!updated) throw badRequest(`Paperclip issue not found for Plane work item ${item.id}`);
        results.push({
          action: "updated",
          planeId: item.id,
          issueId: updated.id,
          identifier: updated.identifier,
        });
        continue;
      }

      const created = await issuesSvc.create(companyId, {
        title: item.name,
        description,
        status: input.status,
        priority,
        originKind: PLANE_WORK_ITEM_ORIGIN_KIND,
        originId: item.id,
        originFingerprint: `plane:${input.workspaceSlug}:${item.id}`,
        idempotencyKey: `plane:${item.id}`,
        allowDuplicate: true,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        agentApiKeyId: actor.agentApiKeyId,
        action: "issue.created",
        entityType: "issue",
        entityId: created.id,
        details: {
          title: created.title,
          identifier: created.identifier,
          source: "plane_sync",
          planeWorkItemId: item.id,
        },
      });
      results.push({
        action: "created",
        planeId: item.id,
        issueId: created.id,
        identifier: created.identifier,
      });
    }

    res.json({
      count: results.length,
      created: results.filter((item) => item.action === "created").length,
      updated: results.filter((item) => item.action === "updated").length,
      existing: results.filter((item) => item.action === "existing").length,
      dryRun: input.dryRun,
      results,
    });
  });

  return router;
}
