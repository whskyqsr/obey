import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";

/** Extensions for the notes editor. Content is stored as Markdown via @tiptap/markdown. */
export function noteExtensions(placeholder = "Write something…"): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}
