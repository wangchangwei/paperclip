import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { ToolProfileWithDetails } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProfileActionDialogKind = "archive" | "delete" | "restore";

export function ProfileActionDialog({
  kind,
  profile,
  pending,
  onClose,
  onArchive,
  onRestore,
  onDelete,
}: {
  kind: ProfileActionDialogKind | null;
  profile: ToolProfileWithDetails | null;
  pending: boolean;
  onClose: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!kind || !profile) return null;

  const defaultDeleteBlocked = kind === "delete" && profile.summary.isCompanyDefault;
  const copy = {
    archive: {
      title: t("profileActionDialog.archiveTitle"),
      body: t("profileActionDialog.archiveBody", { count: profile.summary.appliesToAgentCount }),
      confirm: t("profileActionDialog.archiveConfirm"),
      action: onArchive,
    },
    restore: {
      title: t("profileActionDialog.restoreTitle"),
      body: t("profileActionDialog.restoreBody"),
      confirm: t("profileActionDialog.restoreConfirm"),
      action: onRestore,
    },
    delete: {
      title: t("profileActionDialog.deleteTitle"),
      body: defaultDeleteBlocked
        ? t("profileActionDialog.deleteBlockedBody")
        : t("profileActionDialog.deleteBody", { count: profile.summary.assignmentCount }),
      confirm: t("profileActionDialog.deleteConfirm"),
      action: onDelete,
    },
  }[kind];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {defaultDeleteBlocked ? (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("profileActionDialog.reassignBeforeDelete")}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            variant={kind === "delete" ? "destructive" : "default"}
            disabled={pending || defaultDeleteBlocked}
            onClick={copy.action}
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
