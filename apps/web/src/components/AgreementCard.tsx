import { Link } from "@tanstack/react-router";
import { useAgreement } from "../api/hooks";
import { useRel } from "../lib/relationship";
import { Icon } from "./ui";

/** On Today: a proposal waiting for this person to agree, or their own proposal sent back with a note. */
export function AgreementCard() {
  const { rel, me, features, memberName } = useRel();
  const q = useAgreement(rel.id, features.agreement && !rel.endedAt);
  const v = q.data?.proposal;
  if (!v) return null;
  const toAnswer = v.status === "proposed" && !v.agreements.some((a) => a.userId === me.user.id);
  const sentBack = v.status === "changes_requested" && v.proposedBy === me.user.id && v.feedback;
  if (!toAnswer && !sentBack) return null;
  return (
    <div className="px-4 pb-4 md:px-6">
      <Link to="/agreement" className="state-layer flex items-start gap-4 rounded-xl bg-secondary-container px-4 py-3 text-on-secondary-container">
        <Icon name="handshake" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-title-medium">
            {toAnswer ? `${memberName(v.proposedBy)} proposed version ${v.number} of your agreement` : `${memberName(v.feedback!.userId)} asked for changes to the agreement`}
          </div>
          {(toAnswer ? v.note : v.feedback!.note) && <div className="mt-1 text-body-medium italic opacity-85">“{toAnswer ? v.note : v.feedback!.note}”</div>}
          <div className="mt-1 text-label-large">{toAnswer ? "Read it" : "Edit it"}</div>
        </div>
        <Icon name="chevron_right" className="mt-0.5" />
      </Link>
    </div>
  );
}
