import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { noteExtensions } from "./editorExtensions";
import { Button, Dialog, Icon, TextField, cx } from "./ui";

/**
 * Rich text editor for notes. Shows a formatting toolbar (no Markdown syntax to remember) and reads
 * and writes Markdown, which is what the API stores.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  editable = true,
  bare = false,
  label = "Note body",
  compact = false,
  letters = false,
}: {
  value: string;
  onChange(markdown: string): void;
  placeholder?: string;
  editable?: boolean;
  /** Render without the editing frame, for reading. */
  bare?: boolean;
  label?: string;
  /** A shorter writing area, for a field inside a form. Its toolbar stays put instead of pinning to the top. */
  compact?: boolean;
  /** A whole page of writing, as in the mockups: serif text with no frame, and a short toolbar in a hairline row (or along the bottom on phones). */
  letters?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: noteExtensions(placeholder),
    content: value,
    contentType: "markdown",
    editable,
    immediatelyRender: true,
    editorProps: { attributes: { class: cx("prose-m3 text-on-surface", letters ? "prose-letters py-4" : "px-4 py-4", compact && "prose-compact"), "aria-label": label } },
    onUpdate({ editor }) {
      const md = editor.getMarkdown();
      // Setting up the editor can fire an update with nothing changed; only real edits count.
      if (md === lastEmitted.current) return;
      lastEmitted.current = md;
      onChangeRef.current(md);
    },
  });

  // Accept external value changes (e.g. the note finished loading) without clobbering typing.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (letters)
    return (
      <div>
        {editable && editor && <LettersToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    );

  return (
    <div className={cx(!bare && "group rounded-lg border border-outline-variant bg-surface-container-lowest focus-within:border-primary", bare && "-mx-4")}>
      {editable && editor && <Toolbar editor={editor} pinned={!compact} />}
      <EditorContent editor={editor} />
    </div>
  );
}

/** `pinned` keeps the toolbar under a full-page editor's h-14 header while the text scrolls; a compact field in a form leaves it in place. */
function Toolbar({ editor, pinned }: { editor: Editor; pinned: boolean }) {
  const [openLink, linkDialog] = useLinkDialog(editor);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const groups: { icon: string; label: string; active?: boolean; disabled?: boolean; run(): void }[][] = [
    [
      { icon: "undo", label: "Undo", disabled: !s.canUndo, run: () => chain().undo().run() },
      { icon: "redo", label: "Redo", disabled: !s.canRedo, run: () => chain().redo().run() },
    ],
    [
      { icon: "format_h1", label: "Heading 1", active: s.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
      { icon: "format_h2", label: "Heading 2", active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { icon: "format_h3", label: "Heading 3", active: s.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { icon: "format_bold", label: "Bold (Ctrl+B)", active: s.bold, run: () => chain().toggleBold().run() },
      { icon: "format_italic", label: "Italic (Ctrl+I)", active: s.italic, run: () => chain().toggleItalic().run() },
      { icon: "strikethrough_s", label: "Strikethrough", active: s.strike, run: () => chain().toggleStrike().run() },
      { icon: "code", label: "Inline code", active: s.code, run: () => chain().toggleCode().run() },
    ],
    [
      { icon: "format_list_bulleted", label: "Bulleted list", active: s.bullet, run: () => chain().toggleBulletList().run() },
      { icon: "format_list_numbered", label: "Numbered list", active: s.ordered, run: () => chain().toggleOrderedList().run() },
      { icon: "checklist", label: "Checklist", active: s.task, run: () => chain().toggleTaskList().run() },
      { icon: "format_quote", label: "Quote", active: s.quote, run: () => chain().toggleBlockquote().run() },
      {
        icon: "link",
        label: "Link",
        active: s.link,
        run: openLink,
      },
      { icon: "horizontal_rule", label: "Divider", run: () => chain().setHorizontalRule().run() },
      { icon: "format_clear", label: "Clear formatting", run: () => chain().unsetAllMarks().clearNodes().run() },
    ],
  ];

  return (
    // The opaque page-colored wrapper hides the editor's frame and text as they scroll under the pinned toolbar.
    <div className={cx("-mx-px -mt-px bg-surface", pinned && "sticky top-14 z-10")}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-outline-variant bg-surface-container px-1 py-1 group-focus-within:border-primary group-focus-within:border-b-outline-variant"
      >
        {groups.map((g, i) => (
          <div key={i} className={cx("flex items-center gap-0.5", i > 0 && "border-l border-outline-variant pl-0.5")}>
            {g.map((b) => (
              <button
                key={b.icon}
                type="button"
                title={b.label}
                aria-label={b.label}
                aria-pressed={b.active}
                disabled={b.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={b.run}
                className={cx(
                  "state-layer flex size-9 items-center justify-center rounded-full disabled:opacity-30",
                  b.active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
                )}
              >
                <Icon name={b.icon} size={20} />
              </button>
            ))}
          </div>
        ))}
        {linkDialog}
      </div>
    </div>
  );
}

/** The link button's dialog: add, change or remove a link on the selection. */
function useLinkDialog(editor: Editor) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const active = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("link") });
  const chain = () => editor.chain().focus();

  function apply() {
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else {
      const full = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      if (editor.state.selection.empty && !active)
        chain()
          .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full } }] })
          .run();
      else chain().extendMarkRange("link").setLink({ href: full }).run();
    }
    setOpen(false);
  }

  const show = () => {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setOpen(true);
  };
  const el = (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Link"
      actions={
        <>
          {active && (
            <Button
              variant="text"
              className="mr-auto"
              onClick={() => {
                chain().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="text" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="pt-2"
      >
        <TextField label="URL" type="url" inputMode="url" value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://" />
      </form>
    </Dialog>
  );
  return [show, el] as const;
}

/** How far the on-screen keyboard covers the bottom of the page, so a bar can sit on top of it. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/**
 * The Letters toolbar: the few things people use, as plain line icons. Wider screens get it in a hairline row above
 * the text; phones get it along the bottom, above the keyboard. Typing Markdown (# , 1. , > ) still works for the rest.
 */
function LettersToolbar({ editor }: { editor: Editor }) {
  const [openLink, linkDialog] = useLinkDialog(editor);
  const inset = useKeyboardInset();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: e.isActive("heading"),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const buttons: { icon: string; label: string; active?: boolean; disabled?: boolean; phone?: boolean; desk?: boolean; run(): void }[] = [
    { icon: "format_bold", label: "Bold (Ctrl+B)", active: s.bold, run: () => chain().toggleBold().run() },
    { icon: "format_italic", label: "Italic (Ctrl+I)", active: s.italic, run: () => chain().toggleItalic().run() },
    { icon: "title", label: "Heading", active: s.heading, run: () => chain().toggleHeading({ level: 3 }).run() },
    { icon: "format_list_bulleted", label: "List", active: s.bullet, run: () => chain().toggleBulletList().run() },
    { icon: "checklist", label: "Checklist", active: s.task, run: () => chain().toggleTaskList().run() },
    { icon: "format_quote", label: "Quote", active: s.quote, run: () => chain().toggleBlockquote().run() },
    { icon: "link", label: "Link", active: s.link, run: openLink },
    { icon: "horizontal_rule", label: "Divider", desk: true, run: () => chain().setHorizontalRule().run() },
    { icon: "undo", label: "Undo", phone: true, disabled: !s.canUndo, run: () => chain().undo().run() },
  ];
  return (
    <>
      <div
        role="toolbar"
        aria-label="Formatting"
        style={{ "--kb": `${inset}px` } as CSSProperties}
        className={cx(
          // Phones: a bar on the bottom edge (over the keyboard when it's up). Wider: a row between hairlines.
          "fixed inset-x-0 bottom-[var(--kb)] z-30 flex items-center justify-between border-t border-outline-variant bg-surface-container-lowest px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]",
          "md:sticky md:top-0 md:bottom-auto md:justify-start md:gap-1 md:border-y md:bg-surface md:px-0 md:py-1",
        )}
      >
        {buttons.map((b) => (
          <button
            key={b.icon}
            type="button"
            title={b.label}
            aria-label={b.label}
            aria-pressed={b.active}
            disabled={b.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.run}
            className={cx(
              "state-layer size-11 items-center justify-center rounded-full disabled:opacity-30 md:size-10",
              b.desk ? "hidden md:flex" : b.phone ? "flex md:hidden" : "flex",
              b.active ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant",
            )}
          >
            <Icon name={b.icon} size={22} />
          </button>
        ))}
      </div>
      {linkDialog}
    </>
  );
}
