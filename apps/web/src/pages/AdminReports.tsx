import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAdminPhotoUrl, useAdminReports, useResolveReport } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { AdminReport } from "../api/types";
import { fmtDateTime } from "../lib/dates";
import { useBack } from "../lib/useBack";
import { Button, Icon, IconButton, SegmentedButtons, Spinner, cx, useSnackbar } from "../components/ui";

const REASON: Record<AdminReport["reason"], string> = {
  minor: "Shows someone under 18",
  non_consensual: "Shared without consent",
  illegal: "Something illegal",
  other: "Something else",
};

/** The reported photo, hidden until the reviewer chooses to look. */
function ReportedPhoto({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  const url = useAdminPhotoUrl(id, show).data;
  if (!show) {
    return (
      <Button variant="outlined" icon="visibility" className="self-start" onClick={() => setShow(true)}>
        View photo
      </Button>
    );
  }
  return url ? <img src={url} alt="Reported photo" className="max-h-80 rounded-md object-contain" /> : <Spinner />;
}

function ReportCard({ r }: { r: AdminReport }) {
  const snack = useSnackbar();
  const resolve = useResolveReport();
  const act = (removePhoto: boolean) =>
    resolve.mutate({ id: r.id, removePhoto }, { onSuccess: () => snack(removePhoto ? "Photo removed, report closed" : "Report closed"), onError: (e) => snack(errorMessage(e)) });
  const serious = r.reason === "minor" || r.reason === "illegal";
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <Icon name="flag" className={serious ? "text-error" : "text-on-surface-variant"} />
        <span className={cx("flex-1 text-title-medium", serious ? "text-error" : "text-on-surface")}>{REASON[r.reason]}</span>
        <span className="text-body-small text-on-surface-variant">{fmtDateTime(r.createdAt)}</span>
      </div>
      <div className="text-body-medium text-on-surface-variant">
        <span className="text-on-surface">{r.reporter.displayName}</span> ({r.reporter.email ?? "no email"}) reported{" "}
        <span className="text-on-surface">{r.subject.displayName}</span> ({r.subject.email ?? "no email"})
      </div>
      {r.details && <p className="rounded-sm bg-surface-container px-3 py-2 whitespace-pre-wrap">{r.details}</p>}
      {r.photoId && <ReportedPhoto id={r.photoId} />}
      {r.photoDeleted && <div className="text-body-small text-on-surface-variant">The photo has been deleted.</div>}
      {r.resolvedAt ? (
        <div className="text-body-small text-on-surface-variant">Closed {fmtDateTime(r.resolvedAt)}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {r.photoId && (
            <Button variant="danger" icon="delete" busy={resolve.isPending} onClick={() => act(true)}>
              Remove photo and close
            </Button>
          )}
          <Button variant="tonal" busy={resolve.isPending} onClick={() => act(false)}>
            Close, no action
          </Button>
        </div>
      )}
    </div>
  );
}

/** The Obey team's queue of reports. Only people on the API's admin list ever reach it. */
export function AdminReportsPage() {
  const navigate = useNavigate();
  const back = useBack(() => navigate({ to: "/settings" }));
  const [all, setAll] = useState<"open" | "all">("open");
  const reports = useAdminReports(all === "all");
  return (
    <div className="flex flex-col pb-10">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-1 bg-surface px-2 md:px-4">
        <IconButton icon="arrow_back" label="Back" onClick={back} />
        <h1 className="flex-1 text-title-large text-on-surface">Reports</h1>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 md:px-6">
        <SegmentedButtons<"open" | "all">
          value={all}
          onChange={setAll}
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All" },
          ]}
        />
        {reports.isLoading && <Spinner />}
        {reports.error && <div className="text-error">{errorMessage(reports.error)}</div>}
        {reports.data?.length === 0 && <div className="py-10 text-center text-body-large text-on-surface-variant">Nothing to review.</div>}
        {reports.data?.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
