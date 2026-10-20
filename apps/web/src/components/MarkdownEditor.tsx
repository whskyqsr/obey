import { useEffect, useRef, useState } from "react";
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
}: {
  value: string;
  onChange(markdown: string): void;
  placeholder?: string;
  editable?: boolean;
  /** Render without the editing frame, for reading. */
  bare?: boolean;
  label?: string;
  /** A shorter writing area, for a field inside a form. */
  compact?: boolean;
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
    editorProps: { attributes: { class: cx("prose-m3 px-4 py-4 text-on-surface", compact && "prose-compact"), "aria-label": label } },
    onUpdate({ editor }) {
      const md = editor.getMarkdown();
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

  return (
    <div className={cx(!bare && "group rounded-lg border border-outline-variant bg-surface-container-lowest focus-within:border-primary", bare && "-mx-4")}>
      {editable && editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
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
        run: () => {
          setHref((editor.getAttributes("link").href as string | undefined) ?? "");
          setLinkOpen(true);
        },
      },
      { icon: "horizontal_rule", label: "Divider", run: () => chain().setHorizontalRule().run() },
      { icon: "format_clear", label: "Clear formatting", run: () => chain().unsetAllMarks().clearNodes().run() },
    ],
  ];

  function applyLink() {
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else {
      const full = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      if (editor.state.selection.empty && !s.link)
        chain()
          .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full } }] })
          .run();
      else chain().extendMarkRange("link").setLink({ href: full }).run();
    }
    setLinkOpen(false);
  }

  return (
    // The opaque page-colored wrapper hides the editor's frame and text as they scroll under the pinned toolbar.
    <div className="sticky top-14 z-10 -mx-px -mt-px bg-surface">
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
        <Dialog
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          title="Link"
          actions={
            <>
              {s.link && (
                <Button
                  variant="text"
                  className="mr-auto"
                  onClick={() => {
                    chain().extendMarkRange("link").unsetLink().run();
                    setLinkOpen(false);
                  }}
                >
                  Remove
                </Button>
              )}
              <Button variant="text" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
              <Button onClick={applyLink}>Apply</Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyLink();
            }}
            className="pt-2"
          >
            <TextField label="URL" type="url" inputMode="url" value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://" />
          </form>
        </Dialog>
      </div>
    </div>
  );
}
