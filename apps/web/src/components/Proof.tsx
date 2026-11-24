import { useRef, useState } from "react";
import type { Occurrence, ProofPhoto, ReportReason } from "../api/types";
import { useAcceptProofTerms, useAddProofPhoto, useDeleteProofPhoto, useProofPhotoUrl, useProofPhotos, useReport } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useRel } from "../lib/relationship";
import { Button, Checkbox, Diamond, Dialog, Icon, Select, Spinner, TextArea, cx, useSnackbar } from "./ui";

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
    <Dialog open={open} onClose={onClose} title={<span className="font-serif text-[32px] leading-tight">Before your first photo</span>}>
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-body-large">
          Proof photos are only for you and your partner. They're blurred until opened and deleted after the time your dynamic set.
        </p>
        <ul className="flex flex-col gap-1.5 text-body-large text-on-surface">
          {["Only photos of yourself, with consent", "Nothing illegal, nobody under 18", "Either of you can report a photo to the Fealty team"].map((t) => (
            <li key={t} className="flex gap-3">
              <Icon name="check" size={18} className="mt-1 shrink-0 text-primary" />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex flex-col text-on-surface">
          <div className="border-b border-outline-variant py-2">
            <Checkbox checked={adult} onChange={setAdult} label="I'm 18 or older" />
          </div>
          <div className="border-b border-outline-variant py-2">
            <Checkbox checked={rules} onChange={setRules} label="I'll follow these rules" />
          </div>
        </div>
        <Button
          className="h-12 w-full"
          disabled={!adult || !rules}
          busy={accept.isPending}
          onClick={() => accept.mutate(undefined, { onSuccess: () => onAccepted(), onError: (e) => snack(errorMessage(e)) })}
        >
          Agree
        </Button>
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
  { value: "non_consensual", label: "Shared without someone's consent" },
  { value: "minor", label: "Shows someone under 18" },
  { value: "illegal", label: "Something illegal" },
  { value: "other", label: "Something else" },
];

export function ReportDialog({ subjectId, photoId, onClose }: { subjectId: string; photoId?: string; onClose(): void }) {
  const snack = useSnackbar();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>("other");
  const [details, setDetails] = useState("");
  return (
    <Dialog open onClose={onClose} title={<span className="font-serif text-[32px] leading-tight">What's wrong?</span>}>
      <div className="flex flex-col pb-4">
        <p className="-mt-2 mb-2">Reports go to the Fealty team, not to your partner.</p>
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={reason === r.value}
            onClick={() => setReason(r.value)}
            className="state-layer flex items-center gap-4 border-b border-outline-variant py-3.5 text-left text-body-large text-on-surface"
          >
            <Diamond state={reason === r.value ? "done" : "open"} size={16} className="shrink-0" />
            {r.label}
          </button>
        ))}
        <div className="mt-4">
          <TextArea label="Anything else (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="outlined" className="h-12" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-12"
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
        </div>
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
