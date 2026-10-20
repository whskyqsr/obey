import { useNavigate } from "@tanstack/react-router";
import { DESTINATIONS } from "../components/AppShell";
import { Icon, PageHeader } from "../components/ui";
import { useRel } from "../lib/relationship";

const ITEMS = DESTINATIONS.filter((d) => ["/rewards", "/rules", "/consequences", "/settings"].includes(d.to));

/** Overflow destinations for the compact navigation bar. */
export function MorePage() {
  const navigate = useNavigate();
  const { title } = useRel();
  return (
    <>
      <PageHeader title="More" subtitle={title} />
      <div className="mx-4 overflow-hidden rounded-lg bg-surface-container-low">
        {ITEMS.map((d) => (
          <button key={d.to} type="button" onClick={() => navigate({ to: d.to })} className="state-layer flex w-full items-center gap-4 px-4 py-4 text-left">
            <Icon name={d.icon} className="text-on-surface-variant" />
            <span className="flex-1 text-body-large text-on-surface">{d.label}</span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </button>
        ))}
      </div>
    </>
  );
}
