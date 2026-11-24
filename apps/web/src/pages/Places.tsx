import { Navigate } from "@tanstack/react-router";
import { useAskLocation } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";

/** Places are listed on Location now (mockup 22); old links land there. */
export function PlacesPage() {
  return <Navigate to="/location" replace />;
}

/** For a Dominant: whether a sub's phone can check location tasks, and a nudge to set it up if not. */
export function AskLocationButton({ name }: { name: string }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const ask = useAskLocation(rel.id);
  return (
    <Button
      variant="outlined"
      busy={ask.isPending}
      onClick={() => ask.mutate(undefined, { onSuccess: () => snack(`Asked ${name} to set up location`), onError: (e) => snack(errorMessage(e)) })}
    >
      Ask {name} to set it up
    </Button>
  );
}
