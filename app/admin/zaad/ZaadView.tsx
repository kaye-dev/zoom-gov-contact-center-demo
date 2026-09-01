"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Checkbox } from "@/app/components/Checkbox";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { ZaadDictionary } from "@/app/i18n/zaad-dictionaries";
import {
  getZaadCsvFieldLabel,
  getZaadCsvReasonLabel,
  getZaadErrorMessage,
  sanitizeZaadCsvErrorDetails,
  type ZaadCsvErrorDetail,
} from "@/app/i18n/zaad-error-messages";
import { ZAAD_ERROR_CODES, ZAAD_VOICES } from "@/lib/zaad/contracts";

export type ZaadViewKey =
  | "residents"
  | "contact-lists"
  | "settings"
  | "messages"
  | "campaigns"
  | "one-time";
type UiState = "ready" | "pending" | "success" | "empty" | "failure";
type PermissionSet = { create: boolean; update: boolean; delete: boolean };
type DialogKey =
  | "resident-create"
  | "resident-edit"
  | "resident-delete"
  | "csv-import"
  | "message-form"
  | "message-delete"
  | "contact-list-form"
  | "contact-list-delete"
  | "campaign-start"
  | "campaign-pause"
  | "one-time-confirm";

type Resident = {
  id: string;
  name: string;
  email: string;
  phone: string;
  consentStatus: string;
  source: string;
  revision: number;
  contactList: { id: string; name: string } | null;
  syncStatus: string;
  syncErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};
type ResidentPayload = {
  residents: Resident[];
  metrics: {
    total: number;
    consented: number;
    synced: number;
    needsAttention: number;
  };
  nextCursor: string | null;
};
type Message = {
  id: string;
  name: string;
  body?: string;
  bodyPreview: string;
  languageCode: string;
  voiceId: string;
  zoomAssetId: string | null;
  syncStatus: string;
  syncErrorCode: string | null;
  revision: number;
  updatedAt: string;
};
type ContactList = {
  id: string;
  name: string;
  description: string;
  type: "contact";
  contactCount: number | null;
  revision: string;
  updatedAt: string | null;
};
type ContactListPayload = {
  lists: ContactList[];
  nextPageToken: string | null;
};
type Campaign = {
  id: string;
  name: string;
  dialingMethod: string;
  status: string;
  contactListId: string | null;
  contactListName: string | null;
  contactCount: number | null;
  queueName: string | null;
  callerIdMasked: string | null;
  maxConcurrentCalls: number | null;
  businessHours: string | null;
  retryPolicy: string | null;
  dncPolicy: string | null;
  alwaysRunning: boolean;
  revision: string;
};
type CampaignPayload = { campaigns: Campaign[]; nextPageToken: string | null };
type RegistrationSetting = {
  contactListId: string | null;
  contactListName: string | null;
  revision: number;
  updatedAt: string;
};
type CsvImportResult = {
  totalRows: number;
  createdCount: number;
  duplicateCount: number;
};
type CsvErrorDetail = ZaadCsvErrorDetail;
type Preflight = {
  preflightToken: string;
  expiresAt: string;
  selectedListCount: number;
  selectedResidentCount: number;
  duplicateCount: number;
  recipientCount: number;
  operationProfile: {
    callerIdMasked: string | null;
    queueName: string | null;
    maxConcurrentCalls: number | null;
    businessHours: string | null;
    retryPolicy: string | null;
    dncPolicy: string | null;
    alwaysRunning: false;
  };
};

const SECTION_ORDER: ZaadViewKey[] = [
  "residents",
  "contact-lists",
  "settings",
  "messages",
  "campaigns",
  "one-time",
];

export function ZaadView({
  initialView,
  reviewState,
  reviewSurface,
  reviewDialogMode,
  reviewActor,
  reviewConnection,
  permissions: actualPermissions,
  canViewDeveloperApi,
}: {
  initialView: ZaadViewKey;
  reviewState?: string;
  reviewSurface?: string;
  reviewDialogMode?: string;
  reviewActor?: string;
  reviewConnection?: string;
  permissions: PermissionSet;
  canViewDeveloperApi: boolean;
}) {
  const { locale, t } = useI18n();
  const copy = t.admin.zaad;
  const reviewMode = Boolean(
    reviewState ||
    reviewSurface ||
    reviewDialogMode ||
    reviewActor ||
    reviewConnection,
  );
  const initialPageState: UiState = reviewSurface
    ? "ready"
    : isUiState(reviewState)
      ? reviewState
      : "pending";
  const [view, setView] = useState(initialView);
  const [state, setState] = useState<UiState>(initialPageState);
  const [dialog, setDialog] = useState<DialogKey | null>(
    dialogFromReviewSurface(reviewSurface),
  );
  const [dialogState, setDialogState] = useState<UiState>(
    isUiState(reviewState) ? reviewState : "ready",
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<CsvErrorDetail[]>([]);
  const [connection, setConnection] = useState(
    reviewConnection ?? (reviewMode ? "connected" : "checking"),
  );
  const [residents, setResidents] =
    useState<ResidentPayload>(syntheticResidents);
  const [messages, setMessages] = useState<Message[]>(syntheticMessages);
  const [contactLists, setContactLists] = useState<ContactList[]>(
    syntheticContactLists,
  );
  const [campaigns, setCampaigns] = useState<Campaign[]>(syntheticCampaigns);
  const [setting, setSetting] = useState<RegistrationSetting>(syntheticSetting);
  const [selectedResidentId, setSelectedResidentId] = useState(
    syntheticResidents.residents[0].id,
  );
  const [selectedMessageId, setSelectedMessageId] = useState(
    reviewSurface === "message-form" && reviewDialogMode === "create"
      ? ""
      : syntheticMessages[0].id,
  );
  const [selectedContactListId, setSelectedContactListId] = useState(
    reviewSurface === "contact-list-form" && reviewDialogMode === "create"
      ? ""
      : reviewSurface === "contact-list-delete"
        ? syntheticContactLists[1].id
        : syntheticContactLists[0].id,
  );
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    reviewSurface === "campaign-pause"
      ? syntheticCampaigns[1].id
      : syntheticCampaigns[0].id,
  );
  const [residentCursor, setResidentCursor] = useState<string | null>(null);
  const [residentCursorHistory, setResidentCursorHistory] = useState<
    Array<string | null>
  >([]);
  const [contactListPageToken, setContactListPageToken] = useState<
    string | null
  >(null);
  const [contactListNextPageToken, setContactListNextPageToken] = useState<
    string | null
  >(null);
  const [contactListPageHistory, setContactListPageHistory] = useState<
    Array<string | null>
  >([]);
  const [campaignPageToken, setCampaignPageToken] = useState<string | null>(
    null,
  );
  const [campaignNextPageToken, setCampaignNextPageToken] = useState<
    string | null
  >(null);
  const [campaignPageHistory, setCampaignPageHistory] = useState<
    Array<string | null>
  >([]);
  const [feedback, setFeedback] = useState<string | null>(
    !reviewSurface && reviewState === "success" ? copy.common.success : null,
  );
  const [oneTimeReview, setOneTimeReview] = useState<OneTimeReview>(null);
  const mutationGuard = useSubmissionGuard();
  const permissions = applyReviewActor(actualPermissions, reviewActor);

  const selectedResident =
    residents.residents.find(({ id }) => id === selectedResidentId) ??
    residents.residents[0] ??
    null;
  const selectedMessage = selectedMessageId
    ? (messages.find(({ id }) => id === selectedMessageId) ??
      messages[0] ??
      null)
    : null;
  const selectedContactList = selectedContactListId
    ? (contactLists.find(({ id }) => id === selectedContactListId) ??
      contactLists[0] ??
      null)
    : null;
  const selectedCampaign =
    campaigns.find(({ id }) => id === selectedCampaignId) ??
    campaigns[0] ??
    null;

  useEffect(() => {
    if (state === "failure") focusStatus("zaad-page-error");
  }, [errorCode, state]);

  useEffect(() => {
    if (feedback) focusStatus("zaad-page-feedback");
  }, [feedback]);

  useEffect(() => {
    const zaadPathname = window.location.pathname;
    const restoreViewFromHistory = () => {
      const url = new URL(window.location.href);
      if (url.pathname !== zaadPathname) return;
      setState("pending");
      setErrorCode(null);
      setErrorDetails([]);
      setView(zaadViewFromUrl(url));
      setFeedback(null);
    };
    window.addEventListener("popstate", restoreViewFromHistory);
    return () => {
      window.removeEventListener("popstate", restoreViewFromHistory);
    };
  }, []);

  useEffect(() => {
    if (reviewMode) return;
    let active = true;
    void requestJson<{ state: string }>("/api/admin/zaad/connection")
      .then((body) => {
        if (active) setConnection(body.state);
      })
      .catch(() => {
        if (active) setConnection("outage");
      });
    return () => {
      active = false;
    };
  }, [reviewMode]);

  useEffect(() => {
    if (reviewMode) return;
    let active = true;
    const load = async () => {
      if (view === "residents") {
        const body = await requestJson<ResidentPayload>(
          "/api/admin/zaad/residents",
        );
        if (active) {
          setResidents(body);
          setSelectedResidentId(body.residents[0]?.id ?? "");
          setResidentCursor(null);
          setResidentCursorHistory([]);
          setState(body.residents.length ? "ready" : "empty");
        }
      } else if (view === "messages") {
        const body = await requestJson<{ messages: Message[] }>(
          "/api/admin/zaad/messages",
        );
        const firstId = body.messages[0]?.id;
        const detail = firstId
          ? await requestJson<{ message: Message }>(
              `/api/admin/zaad/messages/${firstId}`,
            ).catch(() => null)
          : null;
        const nextMessages = detail
          ? mergeMessageDetail(body.messages, detail.message)
          : body.messages;
        if (active) {
          setMessages(nextMessages);
          setSelectedMessageId(firstId ?? "");
          setState(nextMessages.length ? "ready" : "empty");
        }
      } else if (view === "contact-lists") {
        const body = await requestJson<ContactListPayload>(
          "/api/admin/zaad/contact-lists",
        );
        if (active) {
          setContactLists(body.lists);
          setSelectedContactListId(body.lists[0]?.id ?? "");
          setContactListPageToken(null);
          setContactListNextPageToken(body.nextPageToken);
          setContactListPageHistory([]);
          setState(body.lists.length ? "ready" : "empty");
        }
      } else if (view === "settings") {
        const [settingBody, listBody] = await Promise.all([
          requestJson<{ setting: RegistrationSetting }>(
            "/api/admin/zaad/registration-settings",
          ),
          requestJson<ContactListPayload>(
            "/api/admin/zaad/contact-lists",
          ).catch(() => ({ lists: [], nextPageToken: null })),
        ]);
        if (active) {
          setSetting(settingBody.setting);
          setContactLists(listBody.lists);
          setState(listBody.lists.length ? "ready" : "empty");
        }
      } else if (view === "campaigns" || view === "one-time") {
        const [campaignBody, listBody, residentBody] = await Promise.all([
          requestJson<CampaignPayload>("/api/admin/zaad/campaigns"),
          requestJson<ContactListPayload>(
            "/api/admin/zaad/contact-lists",
          ).catch(() => ({ lists: [], nextPageToken: null })),
          requestJson<ResidentPayload>("/api/admin/zaad/residents").catch(
            () => emptyResidents,
          ),
        ]);
        if (active) {
          setCampaigns(campaignBody.campaigns);
          setSelectedCampaignId(campaignBody.campaigns[0]?.id ?? "");
          setCampaignPageToken(null);
          setCampaignNextPageToken(campaignBody.nextPageToken);
          setCampaignPageHistory([]);
          setContactLists(listBody.lists);
          setResidents(residentBody);
          setState(campaignBody.campaigns.length ? "ready" : "empty");
        }
      }
    };
    void load().catch((error: unknown) => {
      if (!active) return;
      setErrorCode(error instanceof ZaadUiError ? error.code : "ZAAD_UNKNOWN");
      setState("failure");
    });
    return () => {
      active = false;
    };
  }, [reviewMode, view]);

  const changeView = (next: ZaadViewKey) => {
    if (next === view) return;
    setState("pending");
    setErrorCode(null);
    setErrorDetails([]);
    setView(next);
    setFeedback(null);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
  };

  const refresh = () => {
    if (reviewMode) return;
    setState("pending");
    const current = view;
    setView(current === "residents" ? "messages" : "residents");
    queueMicrotask(() => setView(current));
  };

  const openDialog = (next: DialogKey) => {
    setDialogState(isUiState(reviewState) ? reviewState : "ready");
    setErrorCode(null);
    setErrorDetails([]);
    setDialog(next);
  };

  const loadResidentPage = async (query: string, cursor: string | null) => {
    setState("pending");
    setErrorCode(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("query", query.trim());
      if (cursor) params.set("cursor", cursor);
      const body = await requestJson<ResidentPayload>(
        `/api/admin/zaad/residents${params.size ? `?${params.toString()}` : ""}`,
      );
      setResidents(body);
      setSelectedResidentId(body.residents[0]?.id ?? "");
      setState(body.residents.length ? "ready" : "empty");
      return true;
    } catch (cause) {
      setErrorCode(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
      setState("failure");
      return false;
    }
  };

  const loadContactListPage = async (token: string | null) => {
    setState("pending");
    setErrorCode(null);
    try {
      const query = token ? `?nextPageToken=${encodeURIComponent(token)}` : "";
      const body = await requestJson<ContactListPayload>(
        `/api/admin/zaad/contact-lists${query}`,
      );
      setContactLists(body.lists);
      setSelectedContactListId(body.lists[0]?.id ?? "");
      setContactListNextPageToken(body.nextPageToken);
      setState(body.lists.length ? "ready" : "empty");
      return true;
    } catch (cause) {
      setErrorCode(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
      setState("failure");
      return false;
    }
  };

  const loadCampaignPage = async (token: string | null) => {
    setState("pending");
    setErrorCode(null);
    try {
      const query = token ? `?nextPageToken=${encodeURIComponent(token)}` : "";
      const body = await requestJson<CampaignPayload>(
        `/api/admin/zaad/campaigns${query}`,
      );
      setCampaigns(body.campaigns);
      setSelectedCampaignId(body.campaigns[0]?.id ?? "");
      setCampaignNextPageToken(body.nextPageToken);
      setState(body.campaigns.length ? "ready" : "empty");
      return true;
    } catch (cause) {
      setErrorCode(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
      setState("failure");
      return false;
    }
  };

  return (
    <div id="zaad-page" className="min-w-0" data-review-state={state}>
      <header
        id="zaad-content"
        className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-accent">{copy.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold text-fg">{copy.title}</h1>
          <p className="mt-3 text-sm leading-7 text-fg-muted md:text-base">
            {copy.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBadge state={connection} copy={copy} />
          {canViewDeveloperApi ? (
            <Link
              href="/admin/developer-api"
              className="min-h-11 rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.apiSettings}
            </Link>
          ) : (
            <span
              role="link"
              aria-disabled="true"
              aria-describedby="zaad-developer-api-permission-reason"
              className="min-h-11 cursor-not-allowed rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-fg-muted opacity-60"
            >
              {copy.apiSettings}
            </span>
          )}
        </div>
      </header>

      <nav
        aria-label={copy.title}
        className="mt-7 overflow-x-auto border-b border-line"
      >
        <div className="flex min-w-max">
          {SECTION_ORDER.map((key) => {
            const active = view === key;
            return (
              <a
                key={key}
                data-zaad-view-link={key}
                href={`?view=${key}`}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  changeView(key);
                }}
                className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:bg-surface-hover focus-visible:text-accent focus-visible:outline-none ${active ? "border-accent text-accent" : "border-transparent text-fg-muted hover:border-line hover:text-fg focus-visible:border-accent"}`}
              >
                {sectionLabel(copy, key)}
              </a>
            );
          })}
        </div>
      </nav>

      {feedback ? (
        <p
          id="zaad-page-feedback"
          tabIndex={-1}
          role="status"
          className="mt-5 rounded-md border border-green-700/30 bg-green-50 px-4 py-3 text-sm font-semibold text-green-900 dark:bg-green-950/40 dark:text-green-100"
        >
          {feedback}
        </p>
      ) : null}
      {state === "failure" ? (
        <ErrorBanner id="zaad-page-error" code={errorCode} copy={copy} />
      ) : null}

      {view === "residents" ? (
        <ResidentsSection
          state={state}
          residents={residents}
          permissions={permissions}
          copy={copy}
          onSearch={async (query) => {
            if (reviewMode) return;
            if (await loadResidentPage(query, null)) {
              setResidentCursor(null);
              setResidentCursorHistory([]);
            }
          }}
          onPrevious={async (query) => {
            const previousCursor = residentCursorHistory.at(-1) ?? null;
            if (await loadResidentPage(query, previousCursor)) {
              setResidentCursor(previousCursor);
              setResidentCursorHistory((current) => current.slice(0, -1));
            }
          }}
          onNext={async (query) => {
            const nextCursor = residents.nextCursor;
            if (!nextCursor) return;
            if (await loadResidentPage(query, nextCursor)) {
              setResidentCursorHistory((current) => [
                ...current,
                residentCursor,
              ]);
              setResidentCursor(nextCursor);
            }
          }}
          canGoPrevious={residentCursorHistory.length > 0}
          onSelect={setSelectedResidentId}
          onCreate={() => openDialog("resident-create")}
          onEdit={(id) => {
            setSelectedResidentId(id);
            openDialog("resident-edit");
          }}
          onDelete={(id) => {
            setSelectedResidentId(id);
            openDialog("resident-delete");
          }}
          onRetry={async (resident) => {
            if (!mutationGuard.begin()) return;
            try {
              const { resident: updated } = await requestJson<{
                resident: Resident;
              }>(`/api/admin/zaad/residents/${resident.id}/retry`, {
                method: "POST",
                body: JSON.stringify({ revision: resident.revision }),
              });
              setResidents((current) => ({
                ...current,
                residents: current.residents.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }));
              setFeedback(copy.common.success);
            } catch (cause) {
              captureZaadError(cause, setErrorCode, setErrorDetails);
              setState("failure");
            } finally {
              mutationGuard.end();
            }
          }}
          onCsv={() => openDialog("csv-import")}
        />
      ) : null}
      {view === "messages" ? (
        <MessagesSection
          state={state}
          messages={messages}
          selectedId={selectedMessageId}
          permissions={permissions}
          copy={copy}
          onSelect={(id) => {
            setSelectedMessageId(id);
            setErrorCode(null);
            if (!reviewMode)
              void loadMessageDetail(id, setMessages, setErrorCode, setState);
          }}
          onCreate={() => {
            setSelectedMessageId("");
            openDialog("message-form");
          }}
          onEdit={() => openDialog("message-form")}
          onDelete={() => openDialog("message-delete")}
          onRetry={async (message) => {
            if (!mutationGuard.begin()) return;
            try {
              const { message: updated } = await requestJson<{
                message: Message;
              }>(`/api/admin/zaad/messages/${message.id}/sync`, {
                method: "POST",
                body: JSON.stringify({ revision: message.revision }),
              });
              setMessages((current) => mergeMessageDetail(current, updated));
              setFeedback(copy.common.success);
            } catch (cause) {
              captureZaadError(cause, setErrorCode, setErrorDetails);
              setState("failure");
            } finally {
              mutationGuard.end();
            }
          }}
        />
      ) : null}
      {view === "contact-lists" ? (
        <ContactListsSection
          state={state}
          lists={contactLists}
          selectedId={selectedContactListId}
          setting={setting}
          permissions={permissions}
          copy={copy}
          canGoPrevious={contactListPageHistory.length > 0}
          canGoNext={Boolean(contactListNextPageToken)}
          onPrevious={async () => {
            const previousToken = contactListPageHistory.at(-1) ?? null;
            if (await loadContactListPage(previousToken)) {
              setContactListPageToken(previousToken);
              setContactListPageHistory((current) => current.slice(0, -1));
            }
          }}
          onNext={async () => {
            if (!contactListNextPageToken) return;
            const nextToken = contactListNextPageToken;
            if (await loadContactListPage(nextToken)) {
              setContactListPageHistory((current) => [
                ...current,
                contactListPageToken,
              ]);
              setContactListPageToken(nextToken);
            }
          }}
          onSelect={setSelectedContactListId}
          onCreate={() => {
            setSelectedContactListId("");
            openDialog("contact-list-form");
          }}
          onEdit={() => openDialog("contact-list-form")}
          onDelete={() => openDialog("contact-list-delete")}
        />
      ) : null}
      {view === "settings" ? (
        <SettingsSection
          key={`${setting.revision}:${setting.contactListId ?? "none"}`}
          state={state}
          setting={setting}
          lists={contactLists}
          canUpdate={permissions.update}
          copy={copy}
          onSaved={(next) => {
            setSetting(next);
            setFeedback(copy.common.success);
          }}
        />
      ) : null}
      {view === "campaigns" ? (
        <CampaignsSection
          state={state}
          campaigns={campaigns}
          selectedId={selectedCampaignId}
          canUpdate={permissions.update}
          copy={copy}
          canGoPrevious={campaignPageHistory.length > 0}
          canGoNext={Boolean(campaignNextPageToken)}
          onPrevious={async () => {
            const previousToken = campaignPageHistory.at(-1) ?? null;
            if (await loadCampaignPage(previousToken)) {
              setCampaignPageToken(previousToken);
              setCampaignPageHistory((current) => current.slice(0, -1));
            }
          }}
          onNext={async () => {
            if (!campaignNextPageToken) return;
            const nextToken = campaignNextPageToken;
            if (await loadCampaignPage(nextToken)) {
              setCampaignPageHistory((current) => [
                ...current,
                campaignPageToken,
              ]);
              setCampaignPageToken(nextToken);
            }
          }}
          onSelect={setSelectedCampaignId}
          onStart={() => openDialog("campaign-start")}
          onPause={() => openDialog("campaign-pause")}
        />
      ) : null}
      {view === "one-time" ? (
        <OneTimeSection
          state={state}
          lists={contactLists}
          residents={residents.residents}
          campaigns={campaigns}
          canCreate={permissions.create}
          copy={copy}
          reviewMode={reviewMode}
          onOpenConfirm={(preflight, input) => {
            setOneTimeReview({ preflight, input });
            openDialog("one-time-confirm");
          }}
        />
      ) : null}

      <span id="zaad-permission-create-reason" className="sr-only">
        {copy.errors.permission}
      </span>
      <span id="zaad-permission-update-reason" className="sr-only">
        {copy.errors.permission}
      </span>
      <span id="zaad-permission-delete-reason" className="sr-only">
        {copy.errors.permission}
      </span>
      <span id="zaad-developer-api-permission-reason" className="sr-only">
        {copy.apiSettingsPermission}
      </span>

      <ZaadDialog
        dialog={dialog}
        state={dialogState}
        setState={setDialogState}
        close={() => setDialog(null)}
        copy={copy}
        selectedResident={selectedResident}
        selectedMessage={selectedMessage}
        selectedContactList={selectedContactList}
        selectedCampaign={selectedCampaign}
        permissions={permissions}
        oneTimeReview={oneTimeReview}
        reviewMode={reviewMode}
        reviewDialogMode={reviewDialogMode}
        onMutation={(message) => {
          setFeedback(message);
          setDialog(null);
          refresh();
        }}
        onError={(code, details = []) => {
          setErrorCode(code);
          setErrorDetails(details);
        }}
        errorCode={errorCode}
        errorDetails={errorDetails}
        locale={locale}
        validationMessage={
          dialog ? dialogValidationMessage(dialog, copy) : copy.errors.invalid
        }
      />
    </div>
  );
}

type OneTimeReview = { preflight: Preflight; input: OneTimeRequest } | null;
type OneTimeRequest = {
  operationKey: string;
  name: string;
  body: string;
  languageCode: "ja-JP";
  voiceId: string;
  baseCampaignId: string;
  contactListIds: string[];
  residentSelections: Array<{ id: string; revision: number }>;
};

function ResidentsSection({
  state,
  residents,
  permissions,
  copy,
  onSearch,
  onPrevious,
  onNext,
  canGoPrevious,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onRetry,
  onCsv,
}: {
  state: UiState;
  residents: ResidentPayload;
  permissions: PermissionSet;
  copy: ZaadDictionary;
  onSearch: (query: string) => void;
  onPrevious: (query: string) => void;
  onNext: (query: string) => void;
  canGoPrevious: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (resident: Resident) => void;
  onCsv: () => void;
}) {
  const [query, setQuery] = useState("");
  const pending = state === "pending";
  return (
    <section
      data-zaad-view="residents"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-residents-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="zaad-residents-heading"
            tabIndex={-1}
            className="text-2xl font-bold"
          >
            {copy.residents.heading}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-muted">
            {copy.residents.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton
            onClick={onCsv}
            disabled={pending || !permissions.create}
            describedBy="zaad-permission-create-reason"
            variant="secondary"
          >
            {copy.residents.csv}
          </ActionButton>
          <ActionButton
            onClick={onCreate}
            disabled={pending || !permissions.create}
            describedBy="zaad-permission-create-reason"
          >
            {copy.residents.register}
          </ActionButton>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={copy.residents.total} value={residents.metrics.total} />
        <Metric
          label={copy.residents.consented}
          value={residents.metrics.consented}
        />
        <Metric
          label={copy.residents.synced}
          value={residents.metrics.synced}
        />
        <Metric
          label={copy.residents.needsAttention}
          value={residents.metrics.needsAttention}
          warning
        />
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(query);
        }}
      >
        <label htmlFor="zaad-search" className="sr-only">
          {copy.residents.searchPlaceholder}
        </label>
        <input
          id="zaad-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={pending}
          placeholder={copy.residents.searchPlaceholder}
          className={`${inputClassName} min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {copy.common.search}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setQuery("");
            onSearch("");
          }}
          className={secondaryButtonClass}
        >
          {copy.common.clear}
        </button>
      </form>
      <section
        id="zaad-table-region"
        aria-labelledby="zaad-results-heading"
        className="space-y-3"
      >
        <div className="flex items-end justify-between">
          <div>
            <h3
              id="zaad-results-heading"
              tabIndex={-1}
              className="text-lg font-bold"
            >
              {copy.residents.heading}
            </h3>
            <p className="text-xs text-fg-muted">{residents.metrics.total}</p>
          </div>
        </div>
        {pending ? (
          <PendingPanel copy={copy} />
        ) : state === "empty" || residents.residents.length === 0 ? (
          <EmptyPanel copy={copy} />
        ) : state === "failure" ? (
          <p className="rounded-lg border border-line px-5 py-10 text-center text-sm text-fg-muted">
            {copy.common.failure}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[1050px] divide-y divide-line-subtle text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th scope="col" className={thClass}>
                    {copy.residents.name}
                  </th>
                  <th scope="col" className={thClass}>
                    {copy.residents.contact}
                  </th>
                  <th scope="col" className={thClass}>
                    {copy.residents.consent}
                  </th>
                  <th scope="col" className={thClass}>
                    {copy.residents.source}
                  </th>
                  <th scope="col" className={thClass}>
                    {copy.residents.contactList}
                  </th>
                  <th scope="col" className={thClass}>
                    {copy.residents.registeredAt}
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    {copy.residents.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {residents.residents.map((resident) => (
                  <tr key={resident.id} onClick={() => onSelect(resident.id)}>
                    <td className="px-4 py-4 font-semibold">{resident.name}</td>
                    <td className="px-4 py-4">
                      <span className="block">{resident.email}</span>
                      <span className="text-fg-muted">{resident.phone}</span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        tone={
                          resident.consentStatus === "CONSENTED"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {resident.consentStatus === "CONSENTED"
                          ? copy.residents.consentedValue
                          : copy.residents.notConsentedValue}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4">
                      {sourceLabel(resident.source, copy)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="block">
                        {resident.contactList?.name ||
                          copy.residents.noAssignment}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {syncLabel(resident.syncStatus, copy)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {formatDate(resident.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {resident.syncStatus === "FAILED" &&
                        resident.syncErrorCode !==
                          "ZAAD_ZOOM_RESULT_UNKNOWN" ? (
                          <ActionButton
                            onClick={() => onRetry(resident)}
                            disabled={!permissions.update}
                            describedBy="zaad-permission-update-reason"
                            variant="secondary"
                            small
                          >
                            {copy.common.retry}
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          onClick={() => onEdit(resident.id)}
                          disabled={!permissions.update}
                          describedBy="zaad-permission-update-reason"
                          variant="secondary"
                          small
                        >
                          {copy.common.edit}
                        </ActionButton>
                        <ActionButton
                          onClick={() => onDelete(resident.id)}
                          disabled={!permissions.delete}
                          describedBy="zaad-permission-delete-reason"
                          variant="danger"
                          small
                        >
                          {copy.common.delete}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav
          aria-label={copy.residents.heading}
          className="flex justify-end gap-3"
        >
          <ActionButton
            onClick={() => onPrevious(query)}
            disabled={pending || !canGoPrevious}
            variant="secondary"
            small
          >
            {copy.common.previous}
          </ActionButton>
          <ActionButton
            onClick={() => onNext(query)}
            disabled={pending || !residents.nextCursor}
            variant="secondary"
            small
          >
            {copy.common.next}
          </ActionButton>
        </nav>
      </section>
    </section>
  );
}

function MessagesSection({
  state,
  messages,
  selectedId,
  permissions,
  copy,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onRetry,
}: {
  state: UiState;
  messages: Message[];
  selectedId: string;
  permissions: PermissionSet;
  copy: ZaadDictionary;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetry: (message: Message) => void;
}) {
  const selected = messages.find(({ id }) => id === selectedId) ?? messages[0];
  const pending = state === "pending";
  const showDetail =
    !pending && state !== "empty" && state !== "failure" && Boolean(selected);
  const requiresManualReconciliation =
    selected?.syncStatus === "SYNC_FAILED" &&
    selected.syncErrorCode === ZAAD_ERROR_CODES.zoomResultUnknown;
  return (
    <section
      data-zaad-view="messages"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-messages-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="zaad-messages-heading"
            tabIndex={-1}
            className="text-2xl font-bold"
          >
            {copy.messages.heading}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-muted">
            {copy.messages.description}
          </p>
        </div>
        <ActionButton
          onClick={onCreate}
          disabled={pending || !permissions.create}
          describedBy="zaad-permission-create-reason"
        >
          {copy.messages.create}
        </ActionButton>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
        <section
          aria-labelledby="zaad-message-list-heading"
          className="overflow-hidden rounded-lg border border-line"
        >
          <div className="border-b border-line bg-surface-raised px-4 py-3">
            <h3 id="zaad-message-list-heading" className="font-bold">
              {copy.messages.list}
            </h3>
          </div>
          {pending ? (
            <PendingPanel copy={copy} />
          ) : state === "empty" || state === "failure" ? (
            <EmptyPanel copy={copy} />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {messages.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    data-select-message={message.id}
                    aria-current={message.id === selected?.id}
                    onClick={() => onSelect(message.id)}
                    className={`w-full cursor-pointer px-4 py-4 text-left transition-colors hover:bg-surface-hover ${message.id === selected?.id ? "bg-surface-accent-subtle" : ""}`}
                  >
                    <span className="flex justify-between gap-3">
                      <span>
                        <strong className="block">{message.name}</strong>
                        <span className="mt-1 block text-sm text-fg-muted">
                          {message.languageCode} · {message.voiceId}
                        </span>
                      </span>
                      <StatusBadge
                        tone={
                          message.syncStatus === "SYNCED"
                            ? "success"
                            : message.syncStatus === "SYNC_FAILED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {messageSyncLabel(message.syncStatus, copy)}
                      </StatusBadge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          id="zaad-message-detail"
          hidden={!showDetail}
          className="rounded-lg border border-line bg-surface-raised p-5"
          aria-labelledby="zaad-message-detail-heading"
        >
          {selected ? (
            <>
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-accent">
                    TTS AUDIO ASSET
                  </p>
                  <h3
                    id="zaad-message-detail-heading"
                    tabIndex={-1}
                    className="mt-1 text-xl font-bold"
                  >
                    {selected.name}
                  </h3>
                </div>
                <StatusBadge
                  tone={
                    selected.syncStatus === "SYNCED" ? "success" : "warning"
                  }
                >
                  {messageSyncLabel(selected.syncStatus, copy)}
                </StatusBadge>
              </div>
              <dl className="mt-5 space-y-4 text-sm">
                <Detail
                  label={copy.messages.body}
                  value={selected.body ?? selected.bodyPreview}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail
                    label={copy.messages.language}
                    value={selected.languageCode}
                  />
                  <Detail
                    label={copy.messages.voice}
                    value={selected.voiceId}
                  />
                </div>
                <Detail
                  label={copy.messages.assetId}
                  value={selected.zoomAssetId ?? "—"}
                />
              </dl>
              {requiresManualReconciliation ? (
                <ErrorBanner
                  id="zaad-message-result-unknown"
                  code={ZAAD_ERROR_CODES.zoomResultUnknown}
                  copy={copy}
                />
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                {selected.syncStatus === "SYNC_FAILED" &&
                !requiresManualReconciliation ? (
                  <ActionButton
                    onClick={() => onRetry(selected)}
                    disabled={!permissions.update}
                    describedBy="zaad-permission-update-reason"
                    variant="secondary"
                  >
                    {copy.common.retry}
                  </ActionButton>
                ) : null}
                <ActionButton
                  onClick={onEdit}
                  disabled={!permissions.update}
                  describedBy="zaad-permission-update-reason"
                  variant="secondary"
                >
                  {copy.common.edit}
                </ActionButton>
                <ActionButton
                  onClick={onDelete}
                  disabled={!permissions.delete}
                  describedBy="zaad-permission-delete-reason"
                  variant="danger"
                >
                  {copy.common.delete}
                </ActionButton>
              </div>
            </>
          ) : (
            <div>
              <h3
                id="zaad-message-detail-heading"
                tabIndex={-1}
                className="text-lg font-bold"
              >
                {copy.messages.heading}
              </h3>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function ContactListsSection({
  state,
  lists,
  selectedId,
  setting,
  permissions,
  copy,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: {
  state: UiState;
  lists: ContactList[];
  selectedId: string;
  setting: RegistrationSetting;
  permissions: PermissionSet;
  copy: ZaadDictionary;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const selected = lists.find(({ id }) => id === selectedId) ?? lists[0];
  const pending = state === "pending";
  const showDetail =
    !pending && state !== "empty" && state !== "failure" && Boolean(selected);
  return (
    <section
      data-zaad-view="contact-lists"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-contact-lists-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="zaad-contact-lists-heading"
            tabIndex={-1}
            className="text-2xl font-bold"
          >
            {copy.contactLists.heading}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-muted">
            {copy.contactLists.description}
          </p>
        </div>
        <ActionButton
          onClick={onCreate}
          disabled={!permissions.create}
          describedBy="zaad-permission-create-reason"
        >
          {copy.contactLists.create}
        </ActionButton>
      </div>
      <div className="rounded-lg border border-line bg-surface-raised p-4">
        <p className="text-sm font-bold">{copy.contactLists.current}</p>
        <p className="mt-1 text-sm text-fg-muted">
          {setting.contactListName ?? copy.settings.noAssignment}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <div className="overflow-x-auto rounded-lg border border-line">
          {pending ? (
            <PendingPanel copy={copy} />
          ) : state === "empty" || state === "failure" ? (
            <EmptyPanel copy={copy} />
          ) : (
            <table className="w-full min-w-[620px] divide-y divide-line-subtle text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className={thClass}>{copy.contactLists.name}</th>
                  <th className={`${thClass} text-right`}>
                    {copy.contactLists.contacts}
                  </th>
                  <th className={thClass}>{copy.contactLists.updatedAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {lists.map((list) => (
                  <tr
                    key={list.id}
                    className={
                      list.id === selected?.id ? "bg-surface-accent-subtle" : ""
                    }
                  >
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        data-select-contact-list={list.id}
                        aria-current={list.id === selected?.id}
                        onClick={() => onSelect(list.id)}
                        className="cursor-pointer font-semibold text-accent hover:underline"
                      >
                        {list.name}
                      </button>
                      {setting.contactListId === list.id ? (
                        <span className="ml-2 rounded-full bg-surface-hover px-2 py-0.5 text-xs">
                          {copy.contactLists.current}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {list.contactCount ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      {list.updatedAt ? formatDate(list.updatedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <section
          id="zaad-contact-list-detail"
          hidden={!showDetail}
          className="rounded-lg border border-line bg-surface-raised p-5"
          aria-labelledby="zaad-contact-list-detail-heading"
        >
          {selected ? (
            <>
              <p className="text-xs font-bold text-accent">
                ZOOM CONTACT CENTER
              </p>
              <h3
                id="zaad-contact-list-detail-heading"
                tabIndex={-1}
                className="mt-1 text-xl font-bold"
              >
                {selected.name}
              </h3>
              <dl className="mt-5 space-y-4 text-sm">
                <Detail
                  label={copy.contactLists.descriptionLabel}
                  value={selected.description || "—"}
                />
                <Detail
                  label={copy.contactLists.contacts}
                  value={String(selected.contactCount ?? "—")}
                />
              </dl>
              <div className="mt-6 flex justify-end gap-2">
                <ActionButton
                  onClick={onEdit}
                  disabled={!permissions.update}
                  describedBy="zaad-permission-update-reason"
                  variant="secondary"
                >
                  {copy.common.edit}
                </ActionButton>
                <ActionButton
                  onClick={onDelete}
                  disabled={
                    !permissions.delete || setting.contactListId === selected.id
                  }
                  describedBy={
                    setting.contactListId === selected.id
                      ? "zaad-contact-list-reference-reason"
                      : "zaad-permission-delete-reason"
                  }
                  variant="danger"
                >
                  {copy.common.delete}
                </ActionButton>
              </div>
              <p
                id="zaad-contact-list-reference-reason"
                className="mt-2 text-xs text-fg-muted"
              >
                {copy.contactLists.deleteDescription}
              </p>
            </>
          ) : (
            <div>
              <h3
                id="zaad-contact-list-detail-heading"
                tabIndex={-1}
                className="text-lg font-bold"
              >
                {copy.contactLists.heading}
              </h3>
            </div>
          )}
        </section>
      </div>
      <nav
        aria-label={copy.contactLists.heading}
        className="flex justify-end gap-3"
      >
        <ActionButton
          onClick={onPrevious}
          disabled={pending || !canGoPrevious}
          variant="secondary"
          small
        >
          {copy.common.previous}
        </ActionButton>
        <ActionButton
          onClick={onNext}
          disabled={pending || !canGoNext}
          variant="secondary"
          small
        >
          {copy.common.next}
        </ActionButton>
      </nav>
    </section>
  );
}

function SettingsSection({
  state,
  setting,
  lists,
  canUpdate,
  copy,
  onSaved,
}: {
  state: UiState;
  setting: RegistrationSetting;
  lists: ContactList[];
  canUpdate: boolean;
  copy: ZaadDictionary;
  onSaved: (setting: RegistrationSetting) => void;
}) {
  const [selectedId, setSelectedId] = useState(setting.contactListId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionGuard = useSubmissionGuard();
  const pending = state === "pending";
  const empty = state === "empty";
  const displayedSelectedId = empty ? "" : selectedId;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUpdate || saving || !submissionGuard.begin()) return;
    setSaving(true);
    setError(null);
    const selected = lists.find(({ id }) => id === selectedId);
    try {
      const body = await requestJson<{ setting: RegistrationSetting }>(
        "/api/admin/zaad/registration-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            contactListId: selected?.id ?? null,
            revision: setting.revision,
          }),
        },
      );
      onSaved(body.setting);
    } catch (cause) {
      setError(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
    } finally {
      submissionGuard.end();
      setSaving(false);
    }
  };
  useEffect(() => {
    if (error) focusStatus("zaad-settings-error");
  }, [error]);
  return (
    <section
      data-zaad-view="settings"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-settings-heading"
    >
      <div>
        <h2
          id="zaad-settings-heading"
          tabIndex={-1}
          className="text-2xl font-bold"
        >
          {copy.settings.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-muted">
          {copy.settings.description}
        </p>
      </div>
      {error ? (
        <ErrorBanner id="zaad-settings-error" code={error} copy={copy} />
      ) : null}
      <form
        id="zaad-registration-settings-form"
        onSubmit={save}
        className="max-w-3xl rounded-lg border border-line bg-surface-raised p-5"
        noValidate
      >
        {pending ? <PendingPanel copy={copy} /> : null}
        {empty || lists.length === 0 ? (
          <p
            role="status"
            className="mb-5 border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            {copy.common.empty}
          </p>
        ) : null}
        <label
          htmlFor="zaad-public-contact-list"
          className="block text-sm font-bold"
        >
          {copy.settings.assignment}
        </label>
        <select
          id="zaad-public-contact-list"
          value={displayedSelectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={pending || !canUpdate || saving}
          aria-describedby={
            !canUpdate ? "zaad-permission-update-reason" : undefined
          }
          className={`${inputClassName} cursor-pointer disabled:cursor-not-allowed`}
        >
          <option
            ref={(option) => {
              if (option) option.defaultSelected = empty;
            }}
            value=""
          >
            {copy.settings.noAssignment}
          </option>
          {lists.map((list) => (
            <option
              key={list.id}
              value={list.id}
              hidden={empty}
              disabled={empty}
            >
              {list.name}
              {list.contactCount === null ? "" : ` (${list.contactCount})`}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm leading-7 text-fg-muted">
          {copy.settings.futureOnly}
        </p>
        <div className="mt-5 flex justify-end">
          <ActionButton
            type="submit"
            disabled={pending || !canUpdate || saving}
            describedBy="zaad-permission-update-reason"
          >
            {copy.settings.save}
          </ActionButton>
        </div>
      </form>
    </section>
  );
}

function CampaignsSection({
  state,
  campaigns,
  selectedId,
  canUpdate,
  copy,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onSelect,
  onStart,
  onPause,
}: {
  state: UiState;
  campaigns: Campaign[];
  selectedId: string;
  canUpdate: boolean;
  copy: ZaadDictionary;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  onStart: () => void;
  onPause: () => void;
}) {
  const selected =
    campaigns.find(({ id }) => id === selectedId) ?? campaigns[0];
  const pending = state === "pending";
  const showDetail =
    !pending && state !== "empty" && state !== "failure" && Boolean(selected);
  const startable =
    selected?.dialingMethod === "agentless" &&
    (selected.status === "ready" || selected.status === "paused");
  const pausable =
    selected?.dialingMethod === "agentless" && selected.status === "running";
  return (
    <section
      data-zaad-view="campaigns"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-campaigns-heading"
    >
      <div>
        <h2
          id="zaad-campaigns-heading"
          tabIndex={-1}
          className="text-2xl font-bold"
        >
          {copy.campaigns.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-muted">
          {copy.campaigns.description}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]">
        <div className="overflow-x-auto rounded-lg border border-line">
          {pending ? (
            <PendingPanel copy={copy} />
          ) : state === "empty" || state === "failure" ? (
            <EmptyPanel copy={copy} />
          ) : (
            <table className="w-full min-w-[660px] divide-y divide-line-subtle text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className={thClass}>{copy.campaigns.name}</th>
                  <th className={thClass}>{copy.campaigns.status}</th>
                  <th className={thClass}>{copy.campaigns.method}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={
                      campaign.id === selected?.id
                        ? "bg-surface-accent-subtle"
                        : ""
                    }
                  >
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        data-select-campaign={campaign.id}
                        aria-current={campaign.id === selected?.id}
                        onClick={() => onSelect(campaign.id)}
                        className="cursor-pointer font-semibold text-accent hover:underline"
                      >
                        {campaign.name}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        tone={
                          campaign.status === "running"
                            ? "success"
                            : campaign.status === "ready" ||
                                campaign.status === "paused"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {campaign.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4">{campaign.dialingMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <section
          id="zaad-campaign-detail"
          hidden={!showDetail}
          className="rounded-lg border border-line bg-surface-raised p-5"
          aria-labelledby="zaad-campaign-detail-heading"
        >
          {selected ? (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-accent">
                    AGENTLESS DIALER
                  </p>
                  <h3
                    id="zaad-campaign-detail-heading"
                    tabIndex={-1}
                    className="mt-1 text-xl font-bold"
                  >
                    {selected.name}
                  </h3>
                </div>
                <span id="zaad-campaign-detail-status">
                  <StatusBadge
                    tone={
                      selected.status === "running"
                        ? "success"
                        : selected.status === "ready" ||
                            selected.status === "paused"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {formatCampaignStatus(selected.status)}
                  </StatusBadge>
                </span>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <Detail label={copy.campaigns.status} value={selected.status} />
                <Detail
                  label={copy.campaigns.contactList}
                  value={selected.contactListName ?? "—"}
                />
                <Detail
                  label={copy.campaigns.operationProfile}
                  value={`${selected.queueName ?? "—"} / ${selected.callerIdMasked ?? "—"}`}
                />
                <Detail
                  label={copy.contactLists.contacts}
                  value={String(selected.contactCount ?? "—")}
                />
              </dl>
              <div className="mt-6 flex justify-end gap-2">
                <ActionButton
                  id="zaad-campaign-pause"
                  onClick={onPause}
                  disabled={pending || !canUpdate || !pausable}
                  describedBy="zaad-permission-update-reason"
                  variant="secondary"
                >
                  {copy.campaigns.pause}
                </ActionButton>
                <ActionButton
                  id="zaad-campaign-start"
                  onClick={onStart}
                  disabled={pending || !canUpdate || !startable}
                  describedBy="zaad-permission-update-reason"
                >
                  {copy.campaigns.start}
                </ActionButton>
              </div>
            </>
          ) : (
            <div>
              <div className="flex justify-between gap-3">
                <h3
                  id="zaad-campaign-detail-heading"
                  tabIndex={-1}
                  className="text-lg font-bold"
                >
                  {copy.campaigns.heading}
                </h3>
                <span id="zaad-campaign-detail-status">
                  <StatusBadge tone="neutral">—</StatusBadge>
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
      <nav
        aria-label={copy.campaigns.heading}
        className="flex justify-end gap-3"
      >
        <ActionButton
          onClick={onPrevious}
          disabled={pending || !canGoPrevious}
          variant="secondary"
          small
        >
          {copy.common.previous}
        </ActionButton>
        <ActionButton
          onClick={onNext}
          disabled={pending || !canGoNext}
          variant="secondary"
          small
        >
          {copy.common.next}
        </ActionButton>
      </nav>
    </section>
  );
}

function OneTimeSection({
  state,
  lists,
  residents,
  campaigns,
  canCreate,
  copy,
  reviewMode,
  onOpenConfirm,
}: {
  state: UiState;
  lists: ContactList[];
  residents: Resident[];
  campaigns: Campaign[];
  canCreate: boolean;
  copy: ZaadDictionary;
  reviewMode: boolean;
  onOpenConfirm: (preflight: Preflight, input: OneTimeRequest) => void;
}) {
  const eligibleResidents = residents.filter(
    (resident) => resident.consentStatus === "CONSENTED",
  );
  const baseCampaigns = campaigns.filter(
    (campaign) =>
      campaign.dialingMethod === "agentless" && campaign.status !== "running",
  );
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [voice, setVoice] = useState("Tomoko");
  const [baseCampaignId, setBaseCampaignId] = useState(
    baseCampaigns[0]?.id ?? "",
  );
  const [listIds, setListIds] = useState<string[]>([]);
  const [residentIds, setResidentIds] = useState<string[]>([]);
  const [preflighting, setPreflighting] = useState(false);
  const [validation, setValidation] = useState(state === "empty");
  const [error, setError] = useState<string | null>(
    state === "failure" ? "ZAAD_ZOOM_UNAVAILABLE" : null,
  );
  const submissionGuard = useSubmissionGuard();
  const pending = state === "pending";
  const succeeded = state === "success";
  const canInteract = canCreate && !pending && !succeeded;
  const selectedBaseCampaignId = baseCampaigns.some(
    ({ id }) => id === baseCampaignId,
  )
    ? baseCampaignId
    : (baseCampaigns[0]?.id ?? "");
  const selectedListCount = lists
    .filter((list) => listIds.includes(list.id))
    .reduce((sum, list) => sum + (list.contactCount ?? 0), 0);
  const estimated = selectedListCount + residentIds.length;
  const valid =
    name.trim() &&
    body.trim() &&
    selectedBaseCampaignId &&
    (listIds.length > 0 || residentIds.length > 0) &&
    estimated <= 1000;

  const review = async () => {
    if (!valid || !canCreate) {
      setValidation(true);
      return;
    }
    if (!submissionGuard.begin()) return;
    setPreflighting(true);
    setValidation(false);
    setError(null);
    const input: OneTimeRequest = {
      operationKey: globalThis.crypto.randomUUID(),
      name: name.trim(),
      body: body.trim(),
      languageCode: "ja-JP",
      voiceId: voice,
      baseCampaignId: selectedBaseCampaignId,
      contactListIds: listIds,
      residentSelections: eligibleResidents
        .filter((resident) => residentIds.includes(resident.id))
        .map(({ id, revision }) => ({ id, revision })),
    };
    try {
      const preflight = reviewMode
        ? syntheticPreflight
        : await requestJson<Preflight>(
            "/api/admin/zaad/one-time-dispatches/preflight",
            { method: "POST", body: JSON.stringify(input) },
          );
      onOpenConfirm(preflight, input);
    } catch (cause) {
      setError(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
    } finally {
      submissionGuard.end();
      setPreflighting(false);
    }
  };

  useEffect(() => {
    if (validation) focusStatus("zaad-one-time-validation");
  }, [validation]);

  useEffect(() => {
    if (error) focusStatus("zaad-one-time-error");
  }, [error]);

  return (
    <section
      data-zaad-view="one-time"
      className="mt-6 space-y-6"
      aria-labelledby="zaad-one-time-heading"
    >
      <div>
        <h2
          id="zaad-one-time-heading"
          tabIndex={-1}
          className="text-2xl font-bold"
        >
          {copy.oneTime.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-7 text-fg-muted">
          {copy.oneTime.description}
        </p>
      </div>
      {pending ? <PendingPanel copy={copy} /> : null}
      {succeeded ? (
        <p
          id="zaad-one-time-dispatch-success"
          role="status"
          className="rounded-lg border border-green-700/30 bg-green-50 p-5 font-semibold text-green-900 dark:bg-green-950/40 dark:text-green-100"
        >
          {copy.oneTime.prepared}
        </p>
      ) : null}
      {validation ? (
        <div
          id="zaad-one-time-validation"
          tabIndex={-1}
          role="alert"
          className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-bold">{copy.oneTime.invalid}</p>
          <p>{copy.oneTime.noSources}</p>
        </div>
      ) : null}
      {error ? (
        <ErrorBanner id="zaad-one-time-error" code={error} copy={copy} />
      ) : null}
      <form
        id="zaad-one-time-form"
        hidden={pending || succeeded}
        aria-busy={pending}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void review();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.7fr)]">
          <section
            className="rounded-lg border border-line bg-surface-raised p-5"
            aria-labelledby="zaad-one-time-message-heading"
          >
            <h3
              id="zaad-one-time-message-heading"
              className="text-lg font-bold"
            >
              {copy.oneTime.body}
            </h3>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold">
                  {copy.oneTime.label} *
                </span>
                <input
                  id="zaad-one-time-label"
                  name="label"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                  disabled={!canInteract || preflighting}
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="flex justify-between gap-3 text-sm font-semibold">
                  <span>{copy.oneTime.body} *</span>
                  <span
                    id="zaad-one-time-character-count"
                    className="text-xs font-normal text-fg-muted"
                  >
                    {body.length} / 1,000
                  </span>
                </span>
                <textarea
                  id="zaad-one-time-message"
                  name="message"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  required
                  maxLength={1000}
                  rows={7}
                  disabled={!canInteract || preflighting}
                  className={`${inputClassName} leading-7`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">
                  {copy.oneTime.voice} *
                </span>
                <select
                  id="zaad-one-time-voice"
                  name="voice"
                  value={voice}
                  onChange={(event) => setVoice(event.target.value)}
                  disabled={!canInteract || preflighting}
                  className={`${inputClassName} cursor-pointer disabled:cursor-not-allowed`}
                >
                  {ZAAD_VOICES.map((item) => (
                    <option key={item} value={item}>
                      {item} (ja-JP)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <aside
            className="rounded-lg border border-line bg-surface-raised p-5"
            aria-labelledby="zaad-one-time-profile-heading"
          >
            <h3
              id="zaad-one-time-profile-heading"
              className="text-lg font-bold"
            >
              {copy.campaigns.operationProfile}
            </h3>
            <label className="mt-5 block">
              <span className="text-sm font-semibold">
                {copy.oneTime.baseCampaign} *
              </span>
              <select
                id="zaad-one-time-base-campaign"
                name="baseCampaignId"
                value={selectedBaseCampaignId}
                onChange={(event) => setBaseCampaignId(event.target.value)}
                disabled={!canInteract || preflighting}
                className={`${inputClassName} cursor-pointer disabled:cursor-not-allowed`}
              >
                <option value="">—</option>
                {baseCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.status})
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-5 rounded-md bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {copy.oneTime.confirmDescription}
            </p>
          </aside>
        </div>
        <section
          aria-labelledby="zaad-one-time-recipients-heading"
          className="space-y-4"
        >
          <h3
            id="zaad-one-time-recipients-heading"
            className="text-lg font-bold"
          >
            {copy.oneTime.summary}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="min-w-0 rounded-lg border border-line bg-surface-raised p-5">
              <legend className="px-1 text-sm font-bold">
                {copy.oneTime.lists}
              </legend>
              <div className="mt-3 space-y-3">
                {lists.length ? (
                  lists.map((list, index) => (
                    <label
                      key={list.id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-3 has-[:disabled]:cursor-not-allowed"
                    >
                      <span className="-mt-0.5 flex shrink-0">
                        <Checkbox
                          data-one-time-list={index === 0 ? "radio" : list.id}
                          checked={listIds.includes(list.id)}
                          onChange={(event) =>
                            setListIds((current) =>
                              event.target.checked
                                ? [...current, list.id]
                                : current.filter((id) => id !== list.id),
                            )
                          }
                          disabled={!canInteract || preflighting}
                        />
                      </span>
                      <span>
                        <strong className="block text-sm">{list.name}</strong>
                        <span className="text-xs text-fg-muted">
                          {list.contactCount ?? "—"}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-fg-muted">{copy.common.empty}</p>
                )}
              </div>
            </fieldset>
            <section
              className="min-w-0 rounded-lg border border-line bg-surface-raised p-5"
              aria-labelledby="zaad-one-time-resident-heading"
            >
              <h4
                id="zaad-one-time-resident-heading"
                className="text-sm font-bold"
              >
                {copy.oneTime.residents}
              </h4>
              <div className="mt-3 overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[520px] divide-y divide-line-subtle text-sm">
                  <thead className="bg-surface">
                    <tr>
                      <th className="w-12 px-3 py-2">
                        <span className="sr-only">{copy.common.confirm}</span>
                      </th>
                      <th className={thClass}>{copy.residents.name}</th>
                      <th className={thClass}>{copy.residents.phone}</th>
                      <th className={thClass}>{copy.residents.consent}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {residents.slice(0, 25).map((resident, index) => {
                      const eligible = resident.consentStatus === "CONSENTED";
                      return (
                        <tr
                          key={resident.id}
                          className={!eligible ? "text-fg-muted" : ""}
                        >
                          <td className="px-3 py-3 text-center">
                            <Checkbox
                              aria-label={resident.name}
                              data-one-time-resident={
                                index === 0 ? "hanako" : resident.id
                              }
                              checked={residentIds.includes(resident.id)}
                              onChange={(event) =>
                                setResidentIds((current) =>
                                  event.target.checked
                                    ? [...current, resident.id]
                                    : current.filter(
                                        (id) => id !== resident.id,
                                      ),
                                )
                              }
                              disabled={
                                !eligible || !canInteract || preflighting
                              }
                            />
                          </td>
                          <td className="px-3 py-3">{resident.name}</td>
                          <td className="px-3 py-3">{resident.phone}</td>
                          <td className="px-3 py-3">
                            {eligible
                              ? copy.residents.consentedValue
                              : copy.residents.notConsentedValue}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
        <section
          id="zaad-one-time-summary"
          aria-labelledby="zaad-one-time-summary-heading"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface-raised p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3
                id="zaad-one-time-summary-heading"
                className="text-lg font-bold"
              >
                {copy.oneTime.selection}
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <MetricInline
                  id="zaad-one-time-list-count"
                  label={copy.oneTime.lists}
                  value={listIds.length}
                />
                <MetricInline
                  id="zaad-one-time-resident-count"
                  label={copy.oneTime.residents}
                  value={residentIds.length}
                />
                <MetricInline
                  id="zaad-one-time-duplicate-count"
                  label={copy.oneTime.duplicatesRemoved}
                  value={0}
                />
                <MetricInline
                  id="zaad-one-time-unique-count"
                  label={copy.oneTime.uniqueRecipients}
                  value={estimated}
                />
              </dl>
              <p className="mt-3 text-xs leading-6 text-fg-muted">
                {copy.oneTime.recipientRules}
              </p>
            </div>
            <ActionButton
              id="zaad-one-time-review-action"
              type="submit"
              disabled={!canInteract || !valid || preflighting}
              describedBy={
                !canCreate
                  ? "zaad-permission-create-reason"
                  : "zaad-one-time-selection-reason"
              }
            >
              {preflighting ? copy.oneTime.preflight : copy.oneTime.review}
            </ActionButton>
          </div>
          <p
            id="zaad-one-time-selection-reason"
            className="mt-2 text-xs text-fg-muted"
          >
            {copy.oneTime.selectionReason}
          </p>
        </section>
      </form>
    </section>
  );
}

function ZaadDialog({
  dialog,
  state,
  setState,
  close,
  copy,
  selectedResident,
  selectedMessage,
  selectedContactList,
  selectedCampaign,
  permissions,
  oneTimeReview,
  reviewMode,
  reviewDialogMode,
  onMutation,
  onError,
  errorCode,
  errorDetails,
  locale,
  validationMessage,
}: {
  dialog: DialogKey | null;
  state: UiState;
  setState: (state: UiState) => void;
  close: () => void;
  copy: ZaadDictionary;
  selectedResident: Resident | null;
  selectedMessage: Message | null;
  selectedContactList: ContactList | null;
  selectedCampaign: Campaign | null;
  permissions: PermissionSet;
  oneTimeReview: OneTimeReview;
  reviewMode: boolean;
  reviewDialogMode?: string;
  onMutation: (message: string) => void;
  onError: (code: string | null, details?: CsvErrorDetail[]) => void;
  errorCode: string | null;
  errorDetails: CsvErrorDetail[];
  locale: string;
  validationMessage: string;
}) {
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const previousState = useRef(state);
  useEffect(() => {
    const changed = previousState.current !== state;
    previousState.current = state;
    if (!dialog || !changed) return;
    if (state === "success") focusStatus(`zaad-${dialog}-success`);
    else if (state === "empty" || state === "failure")
      focusStatus(dialogAlertId(dialog, state));
  }, [dialog, state]);
  if (!dialog) return null;
  const config = dialogConfig(
    dialog,
    copy,
    selectedMessage,
    selectedContactList,
    reviewDialogMode,
  );
  const disabled = state === "pending" || state === "success";
  const alertId = dialogAlertId(dialog, state);
  const requestClose = () => {
    if (dialog === "csv-import" && state === "success")
      onMutation(copy.common.success);
    else close();
  };
  return (
    <ModalDialog
      containerId={`zaad-${dialog}-dialog`}
      titleId={`zaad-${dialog}-${state === "success" ? "success" : "title"}`}
      title={state === "success" ? copy.common.success : config.title}
      description={state === "success" ? "" : config.description}
      onRequestClose={requestClose}
      locked={state === "pending"}
      maxWidthClassName={
        dialog === "one-time-confirm" ||
        dialog === "csv-import" ||
        dialog === "message-form"
          ? "max-w-2xl"
          : "max-w-xl"
      }
    >
      {state === "pending" ? (
        <p
          role="status"
          aria-busy="true"
          className="mt-5 rounded-md bg-surface-hover px-4 py-5 text-sm"
        >
          {copy.common.loading}
        </p>
      ) : null}
      {state === "success" ? (
        <div className="mt-5 text-center">
          {dialog === "csv-import" ? (
            <CsvImportResultSummary
              result={csvResult ?? syntheticCsvImportResult}
              copy={copy}
            />
          ) : null}
          <button
            type="button"
            onClick={requestClose}
            className={`${primaryButtonClass} mt-5`}
          >
            {copy.common.close}
          </button>
        </div>
      ) : null}
      {alertId ? (
        <div
          id={alertId}
          tabIndex={-1}
          role="alert"
          className="mt-5 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <p>
            {state === "empty"
              ? validationMessage
              : getZaadErrorMessage(errorCode, copy)}
          </p>
          {dialog === "csv-import" && errorDetails.length > 0 ? (
            <CsvErrorDetails details={errorDetails} copy={copy} />
          ) : null}
        </div>
      ) : null}
      <div
        hidden={state === "success"}
        aria-hidden={state === "success" || undefined}
      >
        {dialog === "resident-create" || dialog === "resident-edit" ? (
          <ResidentDialogForm
            mode={dialog === "resident-create" ? "create" : "edit"}
            resident={selectedResident}
            canSubmit={
              !disabled &&
              (dialog === "resident-create"
                ? permissions.create
                : permissions.update)
            }
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "resident-delete" ? (
          <DeleteResidentForm
            resident={selectedResident}
            canSubmit={!disabled && permissions.delete}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "csv-import" ? (
          <CsvImportForm
            canSubmit={!disabled && permissions.create}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
            onResult={setCsvResult}
          />
        ) : dialog === "message-form" ? (
          <MessageDialogForm
            message={selectedMessage}
            canCreate={!disabled && permissions.create}
            canUpdate={!disabled && permissions.update}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "message-delete" ? (
          <DeleteMessageForm
            message={selectedMessage}
            canSubmit={!disabled && permissions.delete}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "contact-list-form" ? (
          <ContactListDialogForm
            list={selectedContactList}
            canCreate={!disabled && permissions.create}
            canUpdate={!disabled && permissions.update}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "contact-list-delete" ? (
          <DeleteContactListForm
            list={selectedContactList}
            canSubmit={!disabled && permissions.delete}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : dialog === "campaign-start" || dialog === "campaign-pause" ? (
          <CampaignStatusForm
            campaign={selectedCampaign}
            desired={dialog === "campaign-start" ? "running" : "paused"}
            canSubmit={!disabled && permissions.update}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
          />
        ) : (
          <OneTimeConfirmForm
            review={oneTimeReview ?? syntheticOneTimeReview}
            canSubmit={!disabled && permissions.create}
            disabled={disabled}
            copy={copy}
            close={close}
            setState={setState}
            onMutation={onMutation}
            onError={onError}
            reviewMode={reviewMode}
            locale={locale}
          />
        )}
      </div>
    </ModalDialog>
  );
}

function ResidentDialogForm({
  mode,
  resident,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: {
  mode: "create" | "edit";
  resident: Resident | null;
  canSubmit: boolean;
  disabled: boolean;
  copy: ZaadDictionary;
  close: () => void;
  setState: (state: UiState) => void;
  onMutation: (message: string) => void;
  onError: (code: string | null) => void;
  reviewMode: boolean;
}) {
  const submissionGuard = useSubmissionGuard();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setState("empty");
      return;
    }
    if (!submissionGuard.begin()) return;
    const data = new FormData(form);
    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      consentStatus: data.get("consentStatus"),
      ...(mode === "edit" ? { revision: resident?.revision } : {}),
    };
    setState("pending");
    try {
      if (!reviewMode)
        await requestJson(
          `/api/admin/zaad/residents${mode === "edit" ? `/${resident?.id}` : ""}`,
          {
            method: mode === "edit" ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );
      onMutation(copy.common.success);
    } catch (cause) {
      reportZaadError(cause, onError);
      setState("failure");
    } finally {
      submissionGuard.end();
    }
  };
  return (
    <form
      id={`zaad-resident-${mode}-form`}
      onSubmit={submit}
      className="mt-5 space-y-4"
      noValidate
      aria-busy={disabled || undefined}
    >
      <TextField
        id={mode === "create" ? "admin-resident-name" : "edit-resident-name"}
        name="name"
        label={copy.residents.name}
        defaultValue={mode === "edit" ? resident?.name : ""}
        required
        disabled={disabled}
      />
      <TextField
        id={mode === "create" ? "admin-resident-email" : "edit-resident-email"}
        name="email"
        label={copy.residents.email}
        type="email"
        defaultValue={mode === "edit" ? resident?.email : ""}
        required
        disabled={disabled}
      />
      <TextField
        id={mode === "create" ? "admin-resident-phone" : "edit-resident-phone"}
        name="phone"
        label={copy.residents.phone}
        type="tel"
        defaultValue={mode === "edit" ? resident?.phone : ""}
        required
        disabled={disabled}
      />
      <label className="block">
        <span className="text-sm font-semibold">
          {copy.residents.consent} *
        </span>
        <select
          id={
            mode === "create"
              ? "admin-resident-consent-status"
              : "edit-resident-consent-status"
          }
          name="consentStatus"
          defaultValue={mode === "edit" ? resident?.consentStatus : "CONSENTED"}
          required
          disabled={disabled}
          className={`${inputClassName} cursor-pointer`}
        >
          <option
            ref={(option) => {
              if (option && mode === "create") option.defaultSelected = true;
            }}
            value="CONSENTED"
          >
            {copy.residents.consentedValue}
          </option>
          <option value="NOT_CONSENTED">
            {copy.residents.notConsentedValue}
          </option>
        </select>
      </label>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled
            ? mode === "create"
              ? "zaad-permission-create-reason"
              : "zaad-permission-update-reason"
            : undefined
        }
      />
    </form>
  );
}

function DeleteResidentForm({
  resident,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogFormProps & { resident: Resident | null }) {
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-resident-delete-form"
      className="mt-6"
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!resident || !canSubmit || !submissionGuard.begin()) return;
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(`/api/admin/zaad/residents/${resident.id}`, {
              method: "DELETE",
              body: JSON.stringify({ revision: resident.revision }),
            });
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <p className="mb-5 text-sm leading-7 text-fg-muted">
        {copy.residents.deleteDescription}
      </p>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-delete-reason" : undefined
        }
        danger
      />
    </form>
  );
}

function CsvImportForm({
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onError,
  reviewMode,
  onResult,
}: CommonDialogFormProps & { onResult: (result: CsvImportResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-csv-import-form"
      className="mt-5 space-y-4"
      noValidate
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file || !canSubmit) {
          setState("empty");
          return;
        }
        if (!submissionGuard.begin()) return;
        setState("pending");
        try {
          const result = reviewMode
            ? syntheticCsvImportResult
            : await (() => {
                const body = new FormData();
                body.append("file", file, file.name);
                return requestJson<CsvImportResult>(
                  "/api/admin/zaad/residents/imports",
                  { method: "POST", body },
                );
              })();
          onResult(result);
          setState("success");
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <div className="flex flex-col gap-3 rounded-md border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <code
          id="zaad-csv-required-header"
          className="block overflow-x-auto rounded bg-surface-hover px-3 py-2 text-xs"
        >
          name,email,phone,consent_status
        </code>
        <a
          id="zaad-csv-template"
          href="data:text/csv;charset=utf-8,%EF%BB%BFname%2Cemail%2Cphone%2Cconsent_status%0D%0A"
          download="zaad-residents-template.csv"
          className={secondaryButtonClass}
        >
          {copy.residents.csv}
        </a>
      </div>
      <p className="text-xs leading-6 text-fg-muted">
        {copy.residents.csvHelp}
      </p>
      <label className="block">
        <span className="text-sm font-semibold">
          {copy.residents.chooseFile} *
        </span>
        <input
          id="zaad-csv-file"
          type="file"
          accept=".csv,text/csv"
          required
          disabled={disabled}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-1 block min-h-11 w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm file:cursor-pointer disabled:cursor-not-allowed"
        />
      </label>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit || !file}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-create-reason" : undefined
        }
        submitLabel={copy.residents.import}
      />
    </form>
  );
}

function MessageDialogForm({
  message,
  canCreate,
  canUpdate,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogBaseProps & {
  message: Message | null;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const editing = Boolean(message);
  const canSubmit = editing ? canUpdate : canCreate;
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-message-form"
      className="mt-5 space-y-4"
      noValidate
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          setState("empty");
          return;
        }
        if (!submissionGuard.begin()) return;
        const data = new FormData(form);
        const payload = {
          name: data.get("name"),
          body: data.get("body"),
          languageCode: "ja-JP",
          voiceId: data.get("voiceId"),
          ...(editing ? { revision: message?.revision } : {}),
        };
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(
              `/api/admin/zaad/messages${editing ? `/${message?.id}` : ""}`,
              {
                method: editing ? "PATCH" : "POST",
                body: JSON.stringify(payload),
              },
            );
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <TextField
        id="zaad-message-name"
        name="name"
        label={copy.messages.name}
        defaultValue={message?.name ?? ""}
        required
        disabled={disabled}
      />
      <label className="block">
        <span className="text-sm font-semibold">{copy.messages.body} *</span>
        <textarea
          id="zaad-message-body"
          name="body"
          defaultValue={message?.body ?? message?.bodyPreview ?? ""}
          rows={6}
          maxLength={1000}
          required
          disabled={disabled}
          className={`${inputClassName} leading-7`}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="zaad-message-language"
          name="languageCode"
          label={copy.messages.language}
          defaultValue="ja-JP"
          disabled
        />
        <label className="block">
          <span className="text-sm font-semibold">{copy.messages.voice} *</span>
          <select
            id="zaad-message-voice"
            name="voiceId"
            defaultValue={message?.voiceId ?? "Tomoko"}
            disabled={disabled}
            className={`${inputClassName} cursor-pointer`}
          >
            {ZAAD_VOICES.map((voice) => (
              <option key={voice}>{voice}</option>
            ))}
          </select>
        </label>
      </div>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled
            ? editing
              ? "zaad-permission-update-reason"
              : "zaad-permission-create-reason"
            : undefined
        }
      />
    </form>
  );
}

function DeleteMessageForm({
  message,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogFormProps & { message: Message | null }) {
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-message-delete-form"
      className="mt-6"
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!message || !canSubmit || !submissionGuard.begin()) return;
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(`/api/admin/zaad/messages/${message.id}`, {
              method: "DELETE",
              body: JSON.stringify({ revision: message.revision }),
            });
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <p
        id="zaad-message-delete-description"
        className="mb-5 text-sm leading-7 text-fg-muted"
      >
        {copy.messages.deleteDescription}
      </p>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-delete-reason" : undefined
        }
        danger
      />
    </form>
  );
}

function ContactListDialogForm({
  list,
  canCreate,
  canUpdate,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogBaseProps & {
  list: ContactList | null;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const editing = Boolean(list);
  const canSubmit = editing ? canUpdate : canCreate;
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-contact-list-form"
      className="mt-5 space-y-4"
      noValidate
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          setState("empty");
          return;
        }
        if (!submissionGuard.begin()) return;
        const data = new FormData(form);
        const payload = {
          name: data.get("name"),
          description: data.get("description"),
          ...(editing ? { revision: list?.revision } : {}),
        };
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(
              `/api/admin/zaad/contact-lists${editing ? `/${list?.id}` : ""}`,
              {
                method: editing ? "PATCH" : "POST",
                body: JSON.stringify(payload),
              },
            );
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <TextField
        id="zaad-contact-list-name"
        name="name"
        label={copy.contactLists.name}
        defaultValue={list?.name ?? ""}
        required
        disabled={disabled}
      />
      <label className="block">
        <span className="text-sm font-semibold">
          {copy.contactLists.descriptionLabel}
        </span>
        <textarea
          id="zaad-contact-list-description"
          name="description"
          defaultValue={list?.description ?? ""}
          rows={4}
          maxLength={500}
          disabled={disabled}
          className={inputClassName}
        />
      </label>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled
            ? editing
              ? "zaad-permission-update-reason"
              : "zaad-permission-create-reason"
            : undefined
        }
      />
    </form>
  );
}

function DeleteContactListForm({
  list,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogFormProps & { list: ContactList | null }) {
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id="zaad-contact-list-delete-form"
      className="mt-6"
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!list || !canSubmit || !submissionGuard.begin()) return;
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(`/api/admin/zaad/contact-lists/${list.id}`, {
              method: "DELETE",
            });
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <p className="mb-5 text-sm leading-7 text-fg-muted">
        {copy.contactLists.deleteDescription}
      </p>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-delete-reason" : undefined
        }
        danger
      />
    </form>
  );
}

function CampaignStatusForm({
  campaign,
  desired,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
}: CommonDialogFormProps & {
  campaign: Campaign | null;
  desired: "running" | "paused";
}) {
  const submissionGuard = useSubmissionGuard();
  return (
    <form
      id={`zaad-campaign-${desired === "running" ? "start" : "pause"}-form`}
      className="mt-6"
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!campaign || !canSubmit || !submissionGuard.begin()) return;
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson(
              `/api/admin/zaad/campaigns/${campaign.id}/status`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  status: desired,
                  expectedStatus: campaign.status,
                }),
              },
            );
          onMutation(copy.common.success);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <dl className="mb-5 grid gap-3 rounded-md bg-surface-hover p-4 text-sm sm:grid-cols-2">
        <Detail label={copy.campaigns.name} value={campaign?.name ?? "—"} />
        <Detail label={copy.campaigns.status} value={campaign?.status ?? "—"} />
        <Detail
          label={copy.campaigns.contactList}
          value={campaign?.contactListName ?? "—"}
        />
        <Detail
          label={copy.campaigns.operationProfile}
          value={`${campaign?.queueName ?? "—"} / ${campaign?.maxConcurrentCalls ?? "—"}`}
        />
      </dl>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-update-reason" : undefined
        }
        submitLabel={
          desired === "running" ? copy.campaigns.start : copy.campaigns.pause
        }
      />
    </form>
  );
}

function OneTimeConfirmForm({
  review,
  canSubmit,
  disabled,
  copy,
  close,
  setState,
  onMutation,
  onError,
  reviewMode,
  locale,
}: CommonDialogFormProps & {
  review: NonNullable<OneTimeReview>;
  locale: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const submissionGuard = useSubmissionGuard();
  const profile = review.preflight.operationProfile;
  return (
    <form
      id="zaad-one-time-confirm-form"
      className="mt-5 space-y-5"
      aria-busy={disabled || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit || !acknowledged || !submissionGuard.begin()) return;
        setState("pending");
        try {
          if (!reviewMode)
            await requestJson("/api/admin/zaad/one-time-dispatches", {
              method: "POST",
              body: JSON.stringify({
                ...review.input,
                preflightToken: review.preflight.preflightToken,
                acknowledged: true,
              }),
            });
          onMutation(copy.oneTime.prepared);
        } catch (cause) {
          reportZaadError(cause, onError);
          setState("failure");
        } finally {
          submissionGuard.end();
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <section
          className="rounded-md border border-line p-4"
          aria-labelledby="zaad-one-time-confirm-message-heading"
        >
          <h3
            id="zaad-one-time-confirm-message-heading"
            className="text-sm font-bold"
          >
            {copy.oneTime.messageContent}
          </h3>
          <p
            id="zaad-one-time-confirm-message"
            className="mt-2 text-sm leading-7"
          >
            {review.input.body}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            <span id="zaad-one-time-confirm-voice">{review.input.voiceId}</span>{" "}
            (ja-JP)
          </p>
        </section>
        <section
          className="rounded-md border border-line p-4"
          aria-labelledby="zaad-one-time-confirm-recipients-heading"
        >
          <h3
            id="zaad-one-time-confirm-recipients-heading"
            className="text-sm font-bold"
          >
            {copy.oneTime.summary}
          </h3>
          <dl className="mt-2 space-y-2 text-sm">
            <SummaryRow
              id="zaad-one-time-confirm-lists"
              label={copy.oneTime.selectedLists}
              value={review.preflight.selectedListCount}
            />
            <SummaryRow
              id="zaad-one-time-confirm-residents"
              label={copy.oneTime.selectedResidents}
              value={review.preflight.selectedResidentCount}
            />
            <SummaryRow
              id="zaad-one-time-confirm-duplicates"
              label={copy.oneTime.duplicatesRemoved}
              value={review.preflight.duplicateCount}
            />
            <SummaryRow
              id="zaad-one-time-confirm-unique"
              label={copy.oneTime.uniqueRecipients}
              value={review.preflight.recipientCount}
              strong
            />
          </dl>
        </section>
      </div>
      <section
        id="zaad-one-time-confirm-operation-profile"
        className="rounded-md bg-surface-hover p-4"
        aria-labelledby="zaad-one-time-confirm-profile-heading"
      >
        <h3
          id="zaad-one-time-confirm-profile-heading"
          className="text-sm font-bold"
        >
          {copy.campaigns.operationProfile}
        </h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Detail
            label={copy.oneTime.maskedCaller}
            value={profile.callerIdMasked ?? "—"}
          />
          <Detail label={copy.oneTime.queue} value={profile.queueName ?? "—"} />
          <Detail
            label={copy.oneTime.maxConcurrency}
            value={String(profile.maxConcurrentCalls ?? "—")}
          />
          <Detail
            label={copy.oneTime.businessHours}
            value={profile.businessHours ?? "—"}
          />
          <Detail
            label={copy.oneTime.retryPolicy}
            value={profile.retryPolicy ?? "—"}
          />
          <Detail
            label={copy.oneTime.dncPolicy}
            value={profile.dncPolicy ?? "—"}
          />
          <Detail
            label={copy.oneTime.alwaysRunning}
            value={
              profile.alwaysRunning
                ? copy.oneTime.enabled
                : copy.oneTime.disabled
            }
          />
          <Detail
            label={copy.oneTime.expiresAt}
            value={formatDate(review.preflight.expiresAt, locale)}
          />
        </dl>
      </section>
      <p
        id="zaad-one-time-confirm-preflight-status"
        className="text-sm font-semibold text-green-700 dark:text-green-300"
      >
        {copy.oneTime.snapshotReady}
      </p>
      <input
        id="zaad-one-time-preflight-token"
        name="preflightToken"
        type="hidden"
        value={review.preflight.preflightToken}
      />
      <div className="rounded-md bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-bold">{copy.oneTime.immutable}</p>
        <p>{copy.oneTime.prepareDoesNotSend}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-4">
        <span className="mt-0.5 flex shrink-0">
          <Checkbox
            id="zaad-one-time-confirm-acknowledgement"
            required
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={disabled}
          />
        </span>
        <span className="text-sm leading-7">
          {copy.oneTime.acknowledgement}
        </span>
      </label>
      <DialogActions
        close={close}
        copy={copy}
        disabled={!canSubmit || !acknowledged}
        locked={disabled}
        describedBy={
          !canSubmit && !disabled ? "zaad-permission-create-reason" : undefined
        }
        submitLabel={copy.oneTime.prepare}
      />
    </form>
  );
}

type CommonDialogBaseProps = {
  copy: ZaadDictionary;
  close: () => void;
  setState: (state: UiState) => void;
  onMutation: (message: string) => void;
  onError: (code: string | null, details?: CsvErrorDetail[]) => void;
  reviewMode: boolean;
  disabled: boolean;
};

type CommonDialogFormProps = CommonDialogBaseProps & { canSubmit: boolean };

function DialogActions({
  close,
  copy,
  disabled,
  locked = false,
  danger = false,
  submitLabel,
  describedBy,
}: {
  close: () => void;
  copy: ZaadDictionary;
  disabled: boolean;
  locked?: boolean;
  danger?: boolean;
  submitLabel?: string;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={close}
        disabled={locked}
        className={secondaryButtonClass}
      >
        {copy.common.cancel}
      </button>
      <button
        type="submit"
        disabled={disabled}
        aria-describedby={describedBy}
        className={danger ? dangerButtonClass : primaryButtonClass}
      >
        {submitLabel ?? (danger ? copy.common.delete : copy.common.save)}
      </button>
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  required = false,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        className={inputClassName}
      />
    </label>
  );
}

function ConnectionBadge({
  state,
  copy,
}: {
  state: string;
  copy: ZaadDictionary;
}) {
  const label =
    state === "connected"
      ? copy.connection.connected
      : state === "checking"
        ? copy.connection.checking
        : state === "missing"
          ? copy.connection.missing
          : state === "scope"
            ? copy.connection.scope
            : state === "expired"
              ? copy.connection.expired
              : copy.connection.outage;
  const tone =
    state === "connected"
      ? "border-green-700/30 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
      : state === "outage"
        ? "border-red-700/30 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
        : "border-amber-700/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
  return (
    <span
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${tone}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

function PendingPanel({ copy }: { copy: ZaadDictionary }) {
  return (
    <div aria-busy="true" className="mt-6 space-y-4">
      <div className="h-24 animate-pulse rounded-lg bg-surface-hover" />
      <div className="h-72 animate-pulse rounded-lg bg-surface-hover" />
      <span className="sr-only">{copy.common.loading}</span>
    </div>
  );
}

function EmptyPanel({ copy }: { copy: ZaadDictionary }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-line bg-surface-raised px-5 py-10 text-center text-sm text-fg-muted"
    >
      {copy.common.empty}
    </p>
  );
}

function ErrorBanner({
  id,
  code,
  copy,
}: {
  id: string;
  code: string | null;
  copy: ZaadDictionary;
}) {
  return (
    <p
      id={id}
      tabIndex={-1}
      role="alert"
      className="mt-5 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm leading-7 text-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      {getZaadErrorMessage(code, copy)}
    </p>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  describedBy,
  variant = "primary",
  small = false,
  type = "button",
  id,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  describedBy?: string;
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
  type?: "button" | "submit";
  id?: string;
}) {
  const style =
    variant === "primary"
      ? primaryButtonClass
      : variant === "danger"
        ? dangerButtonClass
        : secondaryButtonClass;
  return (
    <button
      id={id}
      type={type}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      aria-describedby={disabled ? describedBy : undefined}
      className={`${style} ${small ? "min-h-9 px-3 py-1.5 text-xs" : ""}`}
    >
      {children}
    </button>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold ${warning && value > 0 ? "text-amber-700 dark:text-amber-300" : "text-fg"}`}
      >
        {value}
      </p>
    </div>
  );
}

function MetricInline({
  id,
  label,
  value,
}: {
  id?: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd id={id} className="font-bold">
        {value}
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words leading-6 text-fg">{value}</dd>
    </div>
  );
}

function SummaryRow({
  id,
  label,
  value,
  strong = false,
}: {
  id: string;
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "border-t border-line pt-2" : ""}`}
    >
      <dt className={strong ? "font-bold" : "text-fg-muted"}>{label}</dt>
      <dd id={id} className="font-bold">
        {value}
      </dd>
    </div>
  );
}

function CsvImportResultSummary({
  result,
  copy,
}: {
  result: CsvImportResult;
  copy: ZaadDictionary;
}) {
  return (
    <dl
      id="zaad-csv-import-result-summary"
      className="mx-auto mt-4 grid max-w-lg gap-3 text-left text-sm sm:grid-cols-3"
    >
      <CsvResultMetric
        name="totalRows"
        label={copy.residents.csvResultTotal}
        value={result.totalRows}
      />
      <CsvResultMetric
        name="createdCount"
        label={copy.residents.csvResultCreated}
        value={result.createdCount}
      />
      <CsvResultMetric
        name="duplicateCount"
        label={copy.residents.csvResultDuplicates}
        value={result.duplicateCount}
      />
    </dl>
  );
}

function CsvResultMetric({
  name,
  label,
  value,
}: {
  name: keyof CsvImportResult;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt className="font-semibold text-fg-muted">{label}</dt>
      <dd data-csv-result={name} className="mt-1 break-words leading-6 text-fg">
        {value}
      </dd>
    </div>
  );
}

function CsvErrorDetails({
  details,
  copy,
}: {
  details: CsvErrorDetail[];
  copy: ZaadDictionary;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="font-bold">{copy.residents.csvErrorHeading}</p>
      <table className="mt-2 w-full min-w-[30rem] text-left text-xs">
        <thead>
          <tr>
            <th className="py-1 pr-3">{copy.residents.csvErrorRow}</th>
            <th className="py-1 pr-3">{copy.residents.csvErrorField}</th>
            <th className="py-1">{copy.residents.csvErrorReason}</th>
          </tr>
        </thead>
        <tbody>
          {details.slice(0, 20).map((detail, index) => (
            <tr key={`${detail.row}:${detail.field}:${index}`}>
              <td className="py-1 pr-3">{detail.row}</td>
              <td className="py-1 pr-3">
                {getZaadCsvFieldLabel(detail.field, copy)}
              </td>
              <td className="py-1">
                {getZaadCsvReasonLabel(detail.code, copy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const style =
    tone === "success"
      ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        : tone === "danger"
          ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          : "bg-surface-hover text-fg-muted";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}
    >
      {children}
    </span>
  );
}

function dialogConfig(
  dialog: DialogKey,
  copy: ZaadDictionary,
  message: Message | null,
  contactList: ContactList | null,
  reviewDialogMode?: string,
) {
  if (dialog === "resident-create")
    return {
      title: copy.residents.createTitle,
      description: copy.residents.description,
    };
  if (dialog === "resident-edit")
    return {
      title: copy.residents.editTitle,
      description: copy.residents.description,
    };
  if (dialog === "resident-delete")
    return {
      title: copy.residents.deleteTitle,
      description: copy.residents.deleteDescription,
    };
  if (dialog === "csv-import")
    return {
      title: copy.residents.csvTitle,
      description: copy.residents.csvDescription,
    };
  if (dialog === "message-form")
    return {
      title:
        reviewDialogMode === "create" || !message
          ? copy.messages.createTitle
          : copy.messages.editTitle,
      description: copy.messages.description,
    };
  if (dialog === "message-delete")
    return {
      title: copy.messages.deleteTitle,
      description: copy.messages.deleteDescription,
    };
  if (dialog === "contact-list-form")
    return {
      title:
        reviewDialogMode === "create" || !contactList
          ? copy.contactLists.createTitle
          : copy.contactLists.editTitle,
      description: copy.contactLists.description,
    };
  if (dialog === "contact-list-delete")
    return {
      title: copy.contactLists.deleteTitle,
      description: copy.contactLists.deleteDescription,
    };
  if (dialog === "campaign-start")
    return {
      title: copy.campaigns.startTitle,
      description: copy.campaigns.startDescription,
    };
  if (dialog === "campaign-pause")
    return {
      title: copy.campaigns.pauseTitle,
      description: copy.campaigns.pauseDescription,
    };
  return {
    title: copy.oneTime.confirmTitle,
    description: copy.oneTime.confirmDescription,
  };
}

function dialogValidationMessage(dialog: DialogKey, copy: ZaadDictionary) {
  if (dialog === "resident-create" || dialog === "resident-edit") {
    return copy.residents.formInvalid;
  }
  if (dialog === "csv-import") return copy.residents.csvFileRequired;
  if (dialog === "message-form") return copy.messages.formInvalid;
  if (dialog === "contact-list-form") return copy.contactLists.formInvalid;
  if (dialog === "one-time-confirm") return copy.oneTime.invalid;
  return copy.errors.invalid;
}

function dialogAlertId(dialog: DialogKey, state: UiState) {
  if (state !== "empty" && state !== "failure") return null;
  if (
    dialog === "resident-delete" ||
    dialog === "message-delete" ||
    dialog === "contact-list-delete"
  ) {
    return `zaad-${dialog}-error`;
  }
  if (
    state === "empty" &&
    (dialog === "campaign-start" ||
      dialog === "campaign-pause" ||
      dialog === "one-time-confirm")
  ) {
    return `zaad-${dialog}-invalid`;
  }
  return `zaad-${dialog}-${state === "empty" ? "error" : "failure"}`;
}

function zaadViewFromUrl(url: URL): ZaadViewKey {
  const requestedView = url.searchParams.get("view");
  return SECTION_ORDER.find((view) => view === requestedView) ?? "residents";
}

function sectionLabel(copy: ZaadDictionary, key: ZaadViewKey) {
  return key === "contact-lists"
    ? copy.sections.contactLists
    : key === "one-time"
      ? copy.sections.oneTime
      : copy.sections[key];
}

function syncLabel(status: string, copy: ZaadDictionary) {
  if (status === "SYNCED") return copy.residents.syncSynced;
  if (status === "FAILED") return copy.residents.syncFailed;
  if (status === "PENDING") return copy.residents.syncPending;
  if (status === "NOT_ELIGIBLE") return copy.residents.syncNotEligible;
  return copy.residents.syncNotAssigned;
}

function messageSyncLabel(status: string, copy: ZaadDictionary) {
  return status === "SYNCED"
    ? copy.messages.synced
    : status === "SYNC_FAILED"
      ? copy.messages.failed
      : copy.messages.pending;
}

function sourceLabel(source: string, copy: ZaadDictionary) {
  return source === "PUBLIC_FORM"
    ? copy.residents.sourceWeb
    : source === "ADMIN_CSV"
      ? copy.residents.sourceCsv
      : copy.residents.sourceAdmin;
}

function formatDate(value: string, locale?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatCampaignStatus(status: string) {
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "—";
}

function mergeMessageDetail(messages: Message[], detail: Message) {
  return messages.map((message) =>
    message.id === detail.id ? { ...message, ...detail } : message,
  );
}

async function loadMessageDetail(
  id: string,
  setMessages: Dispatch<SetStateAction<Message[]>>,
  setErrorCode: Dispatch<SetStateAction<string | null>>,
  setState: Dispatch<SetStateAction<UiState>>,
) {
  try {
    const { message } = await requestJson<{ message: Message }>(
      `/api/admin/zaad/messages/${id}`,
    );
    setMessages((current) => mergeMessageDetail(current, message));
  } catch (cause) {
    setErrorCode(cause instanceof ZaadUiError ? cause.code : "ZAAD_UNKNOWN");
    setState("failure");
  }
}

function applyReviewActor(
  actual: PermissionSet,
  actor: string | undefined,
): PermissionSet {
  if (!actor) return actual;
  if (actor === "creator")
    return { create: actual.create, update: false, delete: false };
  if (actor === "updater" || actor === "editor")
    return { create: false, update: actual.update, delete: false };
  if (actor === "deleter")
    return { create: false, update: false, delete: actual.delete };
  if (actor === "viewer")
    return { create: false, update: false, delete: false };
  return actual;
}

function dialogFromReviewSurface(value: string | undefined): DialogKey | null {
  if (!value) return null;
  const normalized = value
    .replace(/^admin-zaad-/u, "")
    .replace(/-dialog$/u, "");
  const allowed: DialogKey[] = [
    "resident-create",
    "resident-edit",
    "resident-delete",
    "csv-import",
    "message-form",
    "message-delete",
    "contact-list-form",
    "contact-list-delete",
    "campaign-start",
    "campaign-pause",
    "one-time-confirm",
  ];
  return allowed.includes(normalized as DialogKey)
    ? (normalized as DialogKey)
    : null;
}

function isUiState(value: string | undefined): value is UiState {
  return (
    value === "ready" ||
    value === "pending" ||
    value === "success" ||
    value === "empty" ||
    value === "failure"
  );
}

class ZaadUiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: CsvErrorDetail[] = [],
  ) {
    super(code);
    this.name = "ZaadUiError";
  }
}

async function requestJson<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  let body: { error?: string; details?: unknown } & T;
  try {
    body = (await response.json()) as { error?: string; details?: unknown } & T;
  } catch {
    throw new ZaadUiError("ZAAD_INVALID_RESPONSE", response.status);
  }
  if (!response.ok) {
    const code = body.error ?? "ZAAD_REQUEST_FAILED";
    const details =
      code === ZAAD_ERROR_CODES.invalidCsv
        ? sanitizeZaadCsvErrorDetails(body.details)
        : [];
    throw new ZaadUiError(code, response.status, details);
  }
  return body;
}

function useSubmissionGuard() {
  const inFlight = useRef(false);
  return {
    begin() {
      if (inFlight.current) return false;
      inFlight.current = true;
      return true;
    },
    end() {
      inFlight.current = false;
    },
  };
}

function reportZaadError(
  cause: unknown,
  onError: (code: string | null, details?: CsvErrorDetail[]) => void,
) {
  if (cause instanceof ZaadUiError) onError(cause.code, cause.details);
  else onError(null, []);
}

function captureZaadError(
  cause: unknown,
  setCode: Dispatch<SetStateAction<string | null>>,
  setDetails: Dispatch<SetStateAction<CsvErrorDetail[]>>,
) {
  if (cause instanceof ZaadUiError) {
    setCode(cause.code);
    setDetails(cause.details);
  } else {
    setCode("ZAAD_UNKNOWN");
    setDetails([]);
  }
}

function focusStatus(id: string | null) {
  if (!id) return;
  document.getElementById(id)?.focus({ preventScroll: true });
}

const inputClassName =
  "mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "min-h-11 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "min-h-11 cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClass =
  "min-h-11 cursor-pointer rounded-md border border-red-600 bg-surface px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40";
const thClass = "px-4 py-3 text-left font-semibold";

const syntheticResidents: ResidentPayload = {
  residents: [
    {
      id: "resident-hanako",
      name: "山田 花子",
      email: "hanako.yamada@example.jp",
      phone: "+819012345678",
      consentStatus: "CONSENTED",
      source: "PUBLIC_FORM",
      revision: 4,
      contactList: {
        id: "zaad_contact_list_demo_001",
        name: "未来市 防災行政無線 2026",
      },
      syncStatus: "SYNCED",
      syncErrorCode: null,
      createdAt: "2026-09-01T01:32:00.000Z",
      updatedAt: "2026-09-01T01:34:00.000Z",
    },
    {
      id: "resident-ken",
      name: "佐藤 健",
      email: "ken.sato@example.jp",
      phone: "+818023456789",
      consentStatus: "NOT_CONSENTED",
      source: "ADMIN_CSV",
      revision: 2,
      contactList: null,
      syncStatus: "NOT_ELIGIBLE",
      syncErrorCode: null,
      createdAt: "2026-09-01T00:18:00.000Z",
      updatedAt: "2026-09-01T00:18:00.000Z",
    },
    {
      id: "resident-misaki",
      name: "鈴木 美咲",
      email: "misaki.suzuki@example.jp",
      phone: "+817034567890",
      consentStatus: "CONSENTED",
      source: "ADMIN_FORM",
      revision: 1,
      contactList: null,
      syncStatus: "NOT_ASSIGNED",
      syncErrorCode: null,
      createdAt: "2026-08-31T23:47:00.000Z",
      updatedAt: "2026-08-31T23:47:00.000Z",
    },
  ],
  metrics: { total: 128, consented: 121, synced: 116, needsAttention: 2 },
  nextCursor: null,
};

const emptyResidents: ResidentPayload = {
  residents: [],
  metrics: { total: 0, consented: 0, synced: 0, needsAttention: 0 },
  nextCursor: null,
};

const syntheticMessages: Message[] = [
  {
    id: "message-alert",
    name: "大雨警報のお知らせ",
    body: "未来市に大雨警報が発表されました。河川や崖の近くには近づかず、今後の情報に注意してください。",
    bodyPreview:
      "未来市に大雨警報が発表されました。河川や崖の近くには近づかず、今後の情報に注意してください。",
    languageCode: "ja-JP",
    voiceId: "Tomoko",
    zoomAssetId: "zaad_asset_demo_001",
    syncStatus: "SYNCED",
    syncErrorCode: null,
    revision: 3,
    updatedAt: "2026-09-01T01:20:00.000Z",
  },
  {
    id: "message-shelter",
    name: "避難所開設のお知らせ",
    body: "避難所を開設しました。",
    bodyPreview: "避難所を開設しました。",
    languageCode: "ja-JP",
    voiceId: "Takumi",
    zoomAssetId: null,
    syncStatus: "SYNC_FAILED",
    syncErrorCode: "ZAAD_ZOOM_UNAVAILABLE",
    revision: 1,
    updatedAt: "2026-08-31T08:20:00.000Z",
  },
];

const syntheticContactLists: ContactList[] = [
  {
    id: "zaad_contact_list_demo_001",
    name: "未来市 防災行政無線 2026",
    description: "防災行政無線の登録住民向け連絡先リスト",
    type: "contact",
    contactCount: 342,
    revision: "2026-09-01T00:41:00Z",
    updatedAt: "2026-09-01T00:41:00.000Z",
  },
  {
    id: "zaad_contact_list_demo_002",
    name: "避難所周辺住民",
    description: "避難所周辺の連絡先",
    type: "contact",
    contactCount: 89,
    revision: "2026-08-31T06:20:00Z",
    updatedAt: "2026-08-31T06:20:00.000Z",
  },
  {
    id: "zaad_contact_list_demo_003",
    name: "訓練対象者",
    description: "防災訓練用",
    type: "contact",
    contactCount: 25,
    revision: "2026-08-28T04:08:00Z",
    updatedAt: "2026-08-28T04:08:00.000Z",
  },
];

const syntheticCampaigns: Campaign[] = [
  {
    id: "campaign-alert",
    name: "防災行政無線・大雨警報",
    dialingMethod: "agentless",
    status: "ready",
    contactListId: "zaad_contact_list_demo_001",
    contactListName: "未来市 防災行政無線 2026",
    contactCount: 342,
    queueName: "災害情報発信キュー",
    callerIdMasked: "050-****-5678",
    maxConcurrentCalls: 10,
    businessHours: "災害対応時間",
    retryPolicy: "最大2回",
    dncPolicy: "DNC適用・常時実行は無効",
    alwaysRunning: false,
    revision: "campaign-alert:ready",
  },
  {
    id: "campaign-running",
    name: "避難所開設のお知らせ",
    dialingMethod: "agentless",
    status: "running",
    contactListId: "zaad_contact_list_demo_002",
    contactListName: "避難所周辺住民",
    contactCount: 89,
    queueName: "災害情報発信キュー",
    callerIdMasked: "050-****-5678",
    maxConcurrentCalls: 10,
    businessHours: "災害対応時間",
    retryPolicy: "最大2回",
    dncPolicy: "DNC適用・常時実行は無効",
    alwaysRunning: false,
    revision: "campaign-running:running",
  },
  {
    id: "campaign-preview",
    name: "個別確認コール",
    dialingMethod: "preview",
    status: "draft",
    contactListId: null,
    contactListName: null,
    contactCount: null,
    queueName: null,
    callerIdMasked: null,
    maxConcurrentCalls: null,
    businessHours: null,
    retryPolicy: null,
    dncPolicy: null,
    alwaysRunning: false,
    revision: "campaign-preview:draft",
  },
];

const syntheticSetting: RegistrationSetting = {
  contactListId: "zaad_contact_list_demo_001",
  contactListName: "未来市 防災行政無線 2026",
  revision: 3,
  updatedAt: "2026-09-01T01:10:00.000Z",
};

const syntheticCsvImportResult: CsvImportResult = {
  totalRows: 100,
  createdCount: 98,
  duplicateCount: 2,
};

const syntheticPreflight: Preflight = {
  preflightToken: "synthetic-preflight-token-for-browser-review-only",
  expiresAt: "2026-09-01T02:05:00.000Z",
  selectedListCount: 2,
  selectedResidentCount: 2,
  duplicateCount: 5,
  recipientCount: 428,
  operationProfile: {
    callerIdMasked: "050-****-5678",
    queueName: "災害情報発信キュー",
    maxConcurrentCalls: 10,
    businessHours: "災害対応時間",
    retryPolicy: "最大2回",
    dncPolicy: "DNC適用・常時実行は無効",
    alwaysRunning: false,
  },
};

const syntheticOneTimeReview: NonNullable<OneTimeReview> = {
  preflight: syntheticPreflight,
  input: {
    operationKey: "synthetic-operation-key",
    name: "大雨特別警報",
    body: "未来市に大雨特別警報が発表されました。直ちに安全な場所へ避難してください。",
    languageCode: "ja-JP",
    voiceId: "Tomoko",
    baseCampaignId: "campaign-alert",
    contactListIds: [
      "zaad_contact_list_demo_001",
      "zaad_contact_list_demo_002",
    ],
    residentSelections: [
      { id: "resident-hanako", revision: 4 },
      { id: "resident-misaki", revision: 1 },
    ],
  },
};
