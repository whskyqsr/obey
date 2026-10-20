// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { noteExtensions } from "./editorExtensions";

function roundTrip(md: string): string {
  const editor = new Editor({ extensions: noteExtensions(), content: md, contentType: "markdown" });
  const out = editor.getMarkdown();
  editor.destroy();
  return out;
}

describe("notes editor markdown", () => {
  it("parses and re-serializes headings, emphasis, lists, quotes and links", () => {
    const md = [
      "# Aftercare",
      "",
      "Some **bold** and *italic* text with a [link](https://example.com).",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "> a quote",
    ].join("\n");
    const out = roundTrip(md);
    expect(out).toContain("# Aftercare");
    expect(out).toContain("**bold**");
    expect(out).toMatch(/[*_]italic[*_]/);
    expect(out).toContain("[link](https://example.com)");
    expect(out).toMatch(/[-*] one/);
    expect(out).toContain("1. first");
    expect(out).toContain("> a quote");
  });

  it("keeps task lists as GFM checkboxes", () => {
    const out = roundTrip("- [ ] water\n- [x] stretch");
    expect(out).toMatch(/- \[ \] water/);
    expect(out).toMatch(/- \[x\] stretch/);
  });
});
