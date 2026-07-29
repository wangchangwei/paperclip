import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ToolConnection } from "@paperclipai/shared";
import { Navigate, useNavigate, useParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { timeAgo } from "@/lib/timeAgo";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLogo } from "./AppLogo";
import {
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import { connectionAddress, connectionTransportLabel, DangerZone } from "./AppDetail";
import { ActivityPanel } from "./app-detail/ActivityPanel";
import { ReviewPanel } from "./app-detail/ReviewPanel";
import { appApplicationTabHref, appTabHref, appTabLabel, isAppTabKey, type AppTabKey } from "./app-tabs";

export function AppNotConnected() {
  const { t } = useTranslation();
  const { applicationId = "", tab } = useParams<{ applicationId: string; tab?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const activeTab: AppTabKey | null = isAppTabKey(tab) ? tab : null;

  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });
  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!activeTab,
  });

  const application = useMemo(
    () => (applicationsQuery.data?.applications ?? []).find((app) => app.id === applicationId),
    [applicationsQuery.data, applicationId],
  );
  const appConnections = useMemo(
    () => (connectionsQuery.data?.connections ?? []).filter((c) => c.applicationId === applicationId),
    [connectionsQuery.data, applicationId],
  );
  const activeConnection = appConnections.find((c) => c.status !== "archived") ?? null;
  const previousConnection = useMemo(() => latestArchivedConnection(appConnections), [appConnections]);
  const activityQuery = useQuery({
    queryKey: queryKeys.tools.connectionActivity(previousConnection?.id ?? "__none__"),
    queryFn: () => toolsApi.listConnectionActivity(previousConnection!.id, 20),
    enabled: !!previousConnection && activeTab === "activity",
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && activeTab === "activity",
  });

  const appName = application?.name ?? t("appNotConnected.appFallback");
  useEffect(() => {
    if (!activeTab) return;
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("appNotConnected.company"), href: "/dashboard" },
      { label: t("appNotConnected.apps"), href: "/apps" },
      { label: appName, href: appApplicationTabHref(applicationId, "setup") },
      { label: appTabLabel(activeTab) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, selectedCompany?.name, appName, applicationId, activeTab, t]);

  const remove = useMutation({
    mutationFn: () => toolsApi.updateApplication(applicationId, { status: "archived" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__") });
      pushToast({
        title: t("appNotConnected.appRemoved"),
        body: t("appNotConnected.appRemovedBody", { appName }),
        tone: "success",
      });
      navigate("/apps");
    },
    onError: (error) => {
      pushToast({
        title: t("appNotConnected.removeFailed"),
        body: error instanceof Error ? error.message : t("appNotConnected.tryAgain"),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("appNotConnected.emptyCompany")}</div>;
  }
  if (!applicationId || !activeTab) {
    return <Navigate to={applicationId ? appApplicationTabHref(applicationId, "setup") : "/apps"} replace />;
  }
  if (applicationsQuery.isLoading || connectionsQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!application) {
    return (
      <div className="max-w-3xl space-y-3 p-6 text-sm text-muted-foreground">
        <p>{t("appNotConnected.appGone")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/apps")}>
          {t("appNotConnected.backToApps")}
        </Button>
      </div>
    );
  }
  if (activeConnection) {
    return <Navigate to={appTabHref(activeConnection.id, activeTab)} replace />;
  }

  const gallery = (galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[];
  const logoUrl =
    (application.applicationKey
      ? appDefinitionLogoUrl(gallery.find((entry) => appDefinitionSlug(entry) === application.applicationKey))
      : undefined) ??
    appDefinitionLogoUrl(
      gallery.find((entry) => appDefinitionName(entry).toLowerCase() === application.name.toLowerCase()),
    );

  const previousAddress = previousConnection ? connectionAddress(previousConnection, t) : null;
  const connectHref = reconnectHref({
    applicationId,
    appName: application.name,
    previousAddress,
  });

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <ApplicationHeader applicationName={application.name} description={application.description} logoUrl={logoUrl} />

      {activeTab === "setup" && (
        <SetupTab
          previousConnection={previousConnection}
          previousAddress={previousAddress}
          onConnect={() => navigate(connectHref)}
        />
      )}
      {activeTab === "review" && (
        previousConnection ? (
          <ReviewPanel connectionId={previousConnection.id} />
        ) : (
          <EmptyTab
            title={t("appNotConnected.reviewEmptyTitle")}
            body={t("appNotConnected.reviewEmptyBody")}
          />
        )
      )}
      {activeTab === "permissions" && (
        <PermissionsTab previousConnection={previousConnection} />
      )}
      {activeTab === "test" && (
        <EmptyTab
          title={t("appNotConnected.testEmptyTitle")}
          body={t("appNotConnected.testEmptyBody")}
        />
      )}
      {activeTab === "activity" && (
        previousConnection ? (
          <ActivityPanel
            events={activityQuery.data?.events ?? []}
            lifecycleEvents={activityQuery.data?.lifecycleEvents ?? []}
            issues={activityQuery.data?.issues ?? {}}
            actionRequests={activityQuery.data?.actionRequests ?? {}}
            loading={activityQuery.isLoading}
            agents={agentsQuery.data ?? []}
            connectionId={previousConnection.id}
            appName={appName}
          />
        ) : (
          <ActivityPanel
            events={[]}
            lifecycleEvents={[]}
            issues={{}}
            actionRequests={{}}
            loading={false}
            agents={[]}
            connectionId=""
            appName={appName}
          />
        )
      )}
      {activeTab === "advanced" && (
        <AdvancedTab
          appName={application.name}
          previousConnection={previousConnection}
          previousAddress={previousAddress}
          removing={remove.isPending}
          onRemove={() => remove.mutate()}
        />
      )}
    </div>
  );
}

function ApplicationHeader({
  applicationName,
  description,
  logoUrl,
}: {
  applicationName: string;
  description: string | null;
  logoUrl: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-center gap-4">
      <AppLogo name={applicationName} logoUrl={logoUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight">{applicationName}</h1>
          <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("appNotConnected.notConnected")}
          </span>
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </header>
  );
}

function SetupTab({
  previousConnection,
  previousAddress,
  onConnect,
}: {
  previousConnection: ToolConnection | null;
  previousAddress: string | null;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {previousConnection ? t("appNotConnected.reconnectTitle") : t("appNotConnected.connectTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {previousConnection
                ? t("appNotConnected.reconnectBlurb")
                : t("appNotConnected.connectBlurb")}
            </p>
          </div>
          <Button onClick={onConnect}>
            {previousConnection ? t("appNotConnected.reconnect") : t("appNotConnected.connect")}
          </Button>
        </div>
      </section>

      {previousConnection && (
        <PreviousSetup connection={previousConnection} previousAddress={previousAddress} />
      )}
    </div>
  );
}

function PreviousSetup({
  connection,
  previousAddress,
}: {
  connection: ToolConnection;
  previousAddress: string | null;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-bold text-foreground">{t("appNotConnected.previousSetup")}</h2>
      {connection.healthMessage && (
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("appNotConnected.lastError", { message: connection.healthMessage })}
        </p>
      )}
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-(--gtc-59)">
        <dt className="text-muted-foreground">{t("appNotConnected.address")}</dt>
        <dd className="break-all font-mono text-foreground">{previousAddress}</dd>
        <dt className="text-muted-foreground">{t("appNotConnected.connectionType")}</dt>
        <dd className="text-foreground">{connectionTransportLabel(connection.transport, t)}</dd>
        <dt className="text-muted-foreground">{t("appNotConnected.lastUsed")}</dt>
        <dd className="text-foreground">
          {connection.lastUsedAt ? timeAgo(connection.lastUsedAt) : t("appNotConnected.never")}
        </dd>
      </dl>
    </section>
  );
}

function PermissionsTab({ previousConnection }: { previousConnection: ToolConnection | null }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-bold text-foreground">{t("appNotConnected.permissionsPaused")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("appNotConnected.permissionsBlurb")}
      </p>
      {previousConnection && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("appNotConnected.permissionsReadOnly")}
        </p>
      )}
    </section>
  );
}

function AdvancedTab({
  appName,
  previousConnection,
  previousAddress,
  removing,
  onRemove,
}: {
  appName: string;
  previousConnection: ToolConnection | null;
  previousAddress: string | null;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {previousConnection ? (
        <PreviousSetup connection={previousConnection} previousAddress={previousAddress} />
      ) : (
        <EmptyTab
          title={t("appNotConnected.noPreviousTitle")}
          body={t("appNotConnected.noPreviousBody")}
        />
      )}
      <DangerZone appName={appName} removing={removing} onRemove={onRemove} />
    </div>
  );
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}

function latestArchivedConnection(connections: ToolConnection[]): ToolConnection | null {
  const archived = connections.filter((c) => c.status === "archived");
  if (archived.length === 0) return null;
  return archived.reduce((latest, connection) => {
    const latestTime = new Date(latest.updatedAt ?? latest.createdAt ?? 0).getTime();
    const connectionTime = new Date(connection.updatedAt ?? connection.createdAt ?? 0).getTime();
    return connectionTime > latestTime ? connection : latest;
  });
}

function reconnectHref({
  applicationId,
  appName,
  previousAddress,
}: {
  applicationId: string;
  appName: string;
  previousAddress: string | null;
}): string {
  const params = new URLSearchParams({ byo: "1", applicationId, name: appName });
  if (previousAddress && /^https?:\/\//i.test(previousAddress)) params.set("link", previousAddress);
  return `/apps/connect?${params.toString()}`;
}