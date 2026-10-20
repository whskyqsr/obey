import { useRef, useState } from "react";
import type { Occurrence, ProofPhoto, ReportReason } from "../api/types";
import { useAcceptProofTerms, useAddProofPhoto, useDeleteProofPhoto, useProofPhotoUrl, useProofPhotos, useReport } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { Button, Checkbox, Dialog, Icon, Select, Spinner, TextArea, cx, useSnackbar } from "./ui";

/**
 * Shrinks a photo to at most `max` px on its long side and re-encodes it as JPEG. Re-encoding drops the camera's
 * metadata too, location included, so nothing but the picture leaves the device.
 */
export async function shrinkPhoto(file: File, max = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), "image/jpeg", 0.85));
}

/** The one-time 18+ and rules check before a first proof photo. Both boxes, no way around them. */
export function ProofTermsDialog({ open, onClose, onAccepted }: { open: boolean; onClose(): void; onAccepted(): void }) {
  const accept = useAcceptProofTerms();
  const snack = useSnackbar();
  const [adult, setAdult] = useState(false);
  const [rules, setRules] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="add_a_photo"
      title="Before your first photo"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Not now
          </Button>
          <Button
            disabled={!adult || !rules}
            busy={accept.isPending}
            onClick={() => accept.mutate(undefined, { onSuccess: () => onAccepted(), onError: (e) => snack(errorMessage(e)) })}
          >
            Agree
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>Proof photos are seen only by the people in this dynamic. You can delete yours at any time, and either of you can report a photo.</p>
        <p>Never share anything showing someone under 18, anyone who hasn't agreed to be in it, or anything illegal. Breaking these rules gets an account removed.</p>
        <div className="flex flex-col gap-1 text-on-surface">
          <Checkbox checked={adult} onChange={setAdult} label="I'm 18 or older" />
          <Checkbox checked={rules} onChange={setRules} label="I'll follow these rules" />
        </div>
      </div>
    </Dialog>
  );
}

/** A proof photo thumbnail, blurred unless this person turned the blur off in Settings. */
function Thumb({ photo, onOpen }: { photo: ProofPhoto; onOpen(): void }) {
  const { me } = useRel();
  const url = useProofPhotoUrl(photo.id).data;
  const blur = !me.user.revealProofs;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={blur ? "Proof photo, hidden. Open to view" : "Proof photo. Open"}
      className="relative size-20 shrink-0 overflow-hidden rounded-md bg-surface-container-highest"
    >
      {url ? <img src={url} alt="" className={cx("size-full object-cover", blur && "scale-125 blur-xl")} /> : <Spinner size={20} />}
      {blur && (
        <span className="absolute inset-0 flex items-center justify-center text-on-surface">
          <Icon name="visibility_off" size={20} />
        </span>
      )}
    </button>
  );
}

/** One photo, full size, with delete for its owner and report for everyone else. */
function Viewer({ photo, onClose }: { photo: ProofPhoto; onClose(): void }) {
  const { rel, me } = useRel();
  const snack = useSnackbar();
  const url = useProofPhotoUrl(photo.id).data;
  const del = useDeleteProofPhoto(rel.id);
  const [reporting, setReporting] = useState(false);
  const mine = photo.uploaderId === me.user.id;
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        actions={
          <>
            {mine ? (
              <Button
                variant="text"
                className="mr-auto"
                busy={del.isPending}
                onClick={() =>
                  del.mutate(photo, {
                    onSuccess: () => {
                      onClose();
                      snack("Photo deleted");
                    },
                    onError: (e) => snack(errorMessage(e)),
                  })
                }
              >
                Delete
              </Button>
            ) : (
              <Button variant="text" className="mr-auto" onClick={() => setReporting(true)}>
                Report
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </>
        }
      >
        <div className="flex min-h-40 items-center justify-center">
          {url ? <img src={url} alt="Proof photo" className="max-h-[60dvh] w-full rounded-md object-contain" /> : <Spinner />}
        </div>
      </Dialog>
      {reporting && <ReportDialog subjectId={photo.uploaderId} photoId={photo.id} onClose={() => setReporting(false)} />}
    </>
  );
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "minor", label: "Shows someone under 18" },
  { value: "non_consensual", label: "Shared without someone's consent" },
  { value: "illegal", label: "Something illegal" },
  { value: "other", label: "Something else" },
];

export function ReportDialog({ subjectId, photoId, onClose }: { subjectId: string; photoId?: string; onClose(): void }) {
  const snack = useSnackbar();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>("other");
  const [details, setDetails] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={photoId ? "Report this photo" : "Report"}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={report.isPending}
            onClick={() =>
              report.mutate(
                { subjectId, photoId, reason, details: details.trim() || undefined },
                {
                  onSuccess: () => {
                    onClose();
                    snack("Reported. Thanks for telling us.");
                  },
                  onError: (e) => snack(errorMessage(e)),
                },
              )
            }
          >
            Report
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>Reports go to the Fealty team, not to your partner.</p>
        <Select label="What's wrong?" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <TextArea label="Anything else (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} />
      </div>
    </Dialog>
  );
}

/** The photos on an occurrence, plus "Add photo" for its assignee while it's still open. */
export function ProofPhotos({ o, canAdd = false }: { o: Occurrence; canAdd?: boolean }) {
  const { rel, me } = useRel();
  const snack = useSnackbar();
  const photos = useProofPhotos(o.id, o.photoCount > 0 || canAdd);
  const add = useAddProofPhoto(rel.id);
  const input = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState(false);
  const [open, setOpen] = useState<ProofPhoto | null>(null);
  const list = photos.data ?? [];
  if (!canAdd && !list.length) return null;

  async function upload(file: File) {
    try {
      const image = await shrinkPhoto(file);
      add.mutate({ occurrenceId: o.id, image }, { onError: (e) => snack(errorMessage(e)) });
    } catch (e) {
      snack(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.map((p) => (
        <Thumb key={p.id} photo={p} onOpen={() => setOpen(p)} />
      ))}
      {canAdd && list.length < 6 && (
        <>
          <button
            type="button"
            onClick={() => (me.user.proofTermsAccepted ? input.current?.click() : setTerms(true))}
            className="state-layer flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-outline text-label-medium text-primary"
          >
            {add.isPending ? <Spinner size={20} /> : <Icon name="add_a_photo" size={20} />}
            Photo
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </>
      )}
      <ProofTermsDialog
        open={terms}
        onClose={() => setTerms(false)}
        onAccepted={() => {
          setTerms(false);
          input.current?.click();
        }}
      />
      {open && <Viewer photo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
