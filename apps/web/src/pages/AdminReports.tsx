import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAdminPhotoUrl, useAdminReports, useResolveReport } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { AdminReport } from "../api/types";
import { fmtDateTime } from "../lib/dates";
import { useBack } from "../lib/useBack";
import { BackLink, Button, Chip, ErrorBox, Spinner, cx, useSnackbar } from "../components/ui";

const REASON: Record<AdminReport["reason"], string> = {
  minor: "Shows someone under 18",
  non_consensual: "Shared without consent",
  illegal: "Something illegal",
  other: "Something else",
};

/** The reported photo, blurred until the reviewer chooses to look. */
function ReportedPhoto({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  const url = useAdminPhotoUrl(id, show).data;
  return (
    <div className="flex flex-col gap-2">
      {show && url ? (
        <img src={url} alt="Reported photo" className="max-h-80 rounded-sm object-contain" />
      ) : show ? (
        <Spinner />
      ) : (
        <div aria-hidden className="h-24 w-32 rounded-sm bg-outline-variant blur-[2px]" />
      )}
      {!show && (
        <Button variant="outlined" className="self-start" onClick={() => setShow(true)}>
          View photo
        </Button>
      )}
    </div>
  );
}

function ReportRow({ r }: { r: AdminReport }) {
  const snack = useSnackbar();
  const resolve = useResolveReport();
  const act = (removePhoto: boolean) =>
    resolve.mutate({ id: r.id, removePhoto }, { onSuccess: () => snack(removePhoto ? "Photo removed, report closed" : "Report closed"), onError: (e) => snack(errorMessage(e)) });
  const serious = r.reason === "minor" || r.reason === "illegal";
  return (
    <div className="flex flex-col gap-4 border-b border-outline-variant py-5 md:flex-row md:items-start">
      {r.photoId && <ReportedPhoto id={r.photoId} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={cx("text-body-large", serious ? "text-error" : "text-on-surface")}>{REASON[r.reason]}</div>
        <div className="text-body-medium text-on-surface-variant">
          {fmtDateTime(r.createdAt)}
          {r.details ? ` · “${r.details}”` : ""}
        </div>
        <div className="text-body-small text-on-surface-variant">
          {r.reporter.displayName} ({r.reporter.email ?? "no email"}) reported {r.subject.displayName} ({r.subject.email ?? "no email"})
        </div>
        {r.photoDeleted && <div className="text-body-small text-on-surface-variant">The photo has been deleted.</div>}
        {r.resolvedAt && <div className="text-body-small text-on-surface-variant">Closed {fmtDateTime(r.resolvedAt)}</div>}
      </div>
      {!r.resolvedAt && (
        <div className="flex flex-wrap items-center gap-2">
          {r.photoId && (
            <Button busy={resolve.isPending} onClick={() => act(true)}>
              Remove photo and close
            </Button>
          )}
          <Button variant="plain" busy={resolve.isPending} onClick={() => act(false)}>
            Close, no action
          </Button>
        </div>
      )}
    </div>
  );
}

/** The Fealty team's queue of reports (desktop mockup 17). Only people on the API's admin list ever reach it. */
export function AdminReportsPage() {
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/settings" }));
  const [all, setAll] = useState(false);
  const reports = useAdminReports(all);
  return (
    <div className="flex max-w-5xl flex-col pb-10">
      <header className="px-4 pt-3 pb-4 md:px-6 md:pt-6">
        <div className="-mx-2 flex min-h-10 items-center px-2">
          <BackLink label="Settings" onClick={back} />
        </div>
        <div className="eyebrow mt-2">Fealty team</div>
        <h1 className="text-display-small text-on-surface md:text-display-medium">Reports</h1>
      </header>
      <div className="flex flex-col px-4 md:px-6">
        <div className="flex gap-2 pb-2">
          <Chip selected={!all} onClick={() => setAll(false)}>
            Open
          </Chip>
          <Chip selected={all} onClick={() => setAll(true)}>
            All
          </Chip>
        </div>
        {reports.isLoading && <Spinner />}
        {reports.error && <ErrorBox error={reports.error} onRetry={() => reports.refetch()} />}
        {reports.data?.length === 0 && <div className="py-10 text-body-large text-on-surface-variant">Nothing to review.</div>}
        {reports.data?.map((r) => (
          <ReportRow key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
