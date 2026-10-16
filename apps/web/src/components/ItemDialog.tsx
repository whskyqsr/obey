import { useEffect, useState } from "react";
import { Button, Dialog, Select, Switch, TextArea, TextField } from "./ui";

export type FieldDef =
  | { key: string; label: string; type: "text" | "textarea"; required?: boolean; max?: number; help?: string }
  | { key: string; label: string; type: "number"; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: "switch"; help?: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

type Values = Record<string, string | number | boolean | null>;

/** A small create/edit dialog for library items (rewards, consequences, rules). */
export function ItemDialog({
  open,
  title,
  fields,
  initial,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  title: string;
  fields: FieldDef[];
  initial: Values;
  busy?: boolean;
  onClose(): void;
  onSubmit(values: Values): void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState(initial);
  useEffect(() => {
    if (open) setValues(initial);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: Values[string]) => setValues((s) => ({ ...s, [k]: v }));
  const valid = fields.every((f) => !(f.type === "text" && f.required) || String(values[f.key] ?? "").trim());

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          {onDelete && (
            <Button variant="text" className="mr-auto text-error" icon="delete" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!valid} onClick={() => onSubmit(values)}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(values);
        }}
      >
        {fields.map((f) => {
          const v = values[f.key];
          switch (f.type) {
            case "text":
              return <TextField key={f.key} label={f.label} value={String(v ?? "")} maxLength={f.max} help={f.help} onChange={(e) => set(f.key, e.target.value)} />;
            case "textarea":
              return <TextArea key={f.key} label={f.label} value={String(v ?? "")} maxLength={f.max} help={f.help} onChange={(e) => set(f.key, e.target.value)} />;
            case "number":
              return (
                <TextField
                  key={f.key}
                  label={f.label}
                  type="number"
                  min={f.min}
                  max={f.max}
                  help={f.help}
                  value={v === null || v === undefined || Number.isNaN(v) ? "" : String(v)}
                  onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
                />
              );
            case "switch":
              return <Switch key={f.key} label={f.label} help={f.help} checked={Boolean(v)} onChange={(b) => set(f.key, b)} />;
            case "select":
              return (
                <Select key={f.key} label={f.label} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              );
          }
        })}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
