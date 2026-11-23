import { Link } from "@tanstack/react-router";
import { DYNAMIC, InviteButton, useSections, type Dest } from "../components/AppShell";
import { IconButton, Icon, PageHeader } from "../components/ui";
import { useNavigate } from "@tanstack/react-router";
import { useMenu } from "../lib/menu";

function Row({ d }: { d: Dest }) {
  return (
    <li>
      <Link to={d.to} className="state-layer flex items-center gap-3 border-b border-outline-variant py-3 outline-none">
        <Icon name={d.icon} size={20} className="text-on-surface-variant" />
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[20px] leading-6 text-on-surface">{d.label}</span>
        </span>
        <Icon name="chevron_right" size={20} className="text-outline" />
      </Link>
    </li>
  );
}

/** Us: everything the Today and Week tabs don't cover, as one plain list. Settings is the gear. */
export function UsPage() {
  const sections = useSections();
  const menu = useMenu();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Us" tools={<IconButton icon="settings" label="Settings" onClick={() => void navigate({ to: "/settings" })} />} />
      <div className="px-4 md:px-6">
        {menu?.safeWord && (
          <button
            type="button"
            onClick={menu.safeWord}
            className="state-layer mb-4 flex w-full items-center gap-3 rounded-lg border border-primary/40 px-4 py-3 text-left text-primary"
          >
            <Icon name="front_hand" size={20} />
            <span className="flex-1 font-serif text-[20px]">Safe word</span>
            <span className="text-body-small">Yellow to slow down, red to stop</span>
          </button>
        )}
        <ul className="border-t border-outline-variant">
          {sections.map((d) => (
            <Row key={d.to} d={d} />
          ))}
          <Row d={DYNAMIC} />
        </ul>
        {menu?.invite && <InviteButton onClick={menu.invite} className="mt-3 h-12 px-0" />}
      </div>
    </>
  );
}
