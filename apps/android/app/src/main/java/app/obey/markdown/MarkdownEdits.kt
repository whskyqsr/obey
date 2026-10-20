package app.obey.markdown

/**
 * Pure text transformations behind the notes editor toolbar. Positions are character offsets;
 * [start] <= [end]. Everything here is framework-free so it can be unit-tested on the JVM.
 */
data class TextEdit(val text: String, val start: Int, val end: Int)

/** Line prefixes the toolbar can toggle. Order matters: longer, more specific prefixes first. */
enum class LinePrefix(val token: String) {
    Checked("- [x] "),
    Checklist("- [ ] "),
    Bullet("- "),
    Numbered("1. "),
    Heading1("# "),
    Heading2("## "),
    Heading3("### "),
    Quote("> "),
}

private val blockPrefix = Regex("""^(#{1,6} |- \[[ xX]\] |[-*+] |\d+\. |> )""")

object MarkdownEdits {
    /** Wraps the selection in [marker] (e.g. "**"), or unwraps it if it is already wrapped. */
    fun toggleInline(text: String, start: Int, end: Int, marker: String): TextEdit {
        val m = marker.length
        // Already wrapped just outside the selection: unwrap.
        if (start >= m && end + m <= text.length &&
            text.substring(start - m, start) == marker && text.substring(end, end + m) == marker
        ) {
            val t = text.substring(0, start - m) + text.substring(start, end) + text.substring(end + m)
            return TextEdit(t, start - m, end - m)
        }
        // Selection itself includes the markers: unwrap.
        val selected = text.substring(start, end)
        if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
            val inner = selected.substring(m, selected.length - m)
            return TextEdit(text.substring(0, start) + inner + text.substring(end), start, start + inner.length)
        }
        val t = text.substring(0, start) + marker + selected + marker + text.substring(end)
        return TextEdit(t, start + m, end + m)
    }

    /**
     * Toggles [prefix] on every line touched by the selection. If all lines already have it, it is removed;
     * otherwise any other block prefix is replaced by it. Numbered lists are renumbered from 1.
     */
    fun toggleLinePrefix(text: String, start: Int, end: Int, prefix: LinePrefix): TextEdit {
        val lineStart = text.lastIndexOf('\n', (start - 1).coerceAtLeast(0)).let { if (start == 0) 0 else it + 1 }
        val lineEndIdx = text.indexOf('\n', end).let { if (it == -1) text.length else it }
        val block = text.substring(lineStart, lineEndIdx)
        val lines = block.split('\n')

        fun has(line: String) = when (prefix) {
            LinePrefix.Numbered -> Regex("""^\d+\. """).containsMatchIn(line)
            LinePrefix.Checklist -> line.startsWith("- [ ] ") || line.startsWith("- [x] ") || line.startsWith("- [X] ")
            LinePrefix.Bullet -> (line.startsWith("- ") || line.startsWith("* ")) && !line.startsWith("- [")
            else -> line.startsWith(prefix.token)
        }

        val removeAll = lines.all { has(it) || it.isBlank() } && lines.any { has(it) }
        var number = 0
        val newLines = lines.map { line ->
            val stripped = line.replaceFirst(blockPrefix, "")
            when {
                removeAll -> stripped
                line.isBlank() && lines.size > 1 -> line
                prefix == LinePrefix.Numbered -> { number += 1; "$number. $stripped" }
                else -> prefix.token + stripped
            }
        }
        val newBlock = newLines.joinToString("\n")
        val t = text.substring(0, lineStart) + newBlock + text.substring(lineEndIdx)
        val delta = newBlock.length - block.length
        return if (start == end) {
            // Keep the caret on the same logical character of a single line.
            val firstDelta = newLines.first().length - lines.first().length
            val caret = (start + firstDelta).coerceIn(lineStart, lineStart + newBlock.length)
            TextEdit(t, caret, caret)
        } else {
            TextEdit(t, lineStart, lineEndIdx + delta)
        }
    }

    /**
     * Called when the user typed a newline at [caret] (the caret is just after the new "\n").
     * Continues bullet, checklist, numbered and quote lines; an empty list item ends the list instead.
     * Returns null when nothing special should happen.
     */
    fun continueList(text: String, caret: Int): TextEdit? {
        if (caret == 0 || text[caret - 1] != '\n') return null
        val prevEnd = caret - 1
        val prevStart = text.lastIndexOf('\n', prevEnd - 1).let { if (prevEnd == 0) 0 else it + 1 }
        val prev = text.substring(prevStart, prevEnd)
        val match = Regex("""^(\s*)(- \[[ xX]\] |[-*+] |(\d+)\. |> )(.*)$""").find(prev) ?: return null
        val indent = match.groupValues[1]
        val marker = match.groupValues[2]
        val content = match.groupValues[4]
        if (content.isBlank()) {
            // Empty item: remove its marker and the newline just typed, ending the list.
            val t = text.substring(0, prevStart) + text.substring(caret)
            return TextEdit(t, prevStart, prevStart)
        }
        val next = when {
            marker.startsWith("- [") -> "- [ ] "
            match.groupValues[3].isNotEmpty() -> "${match.groupValues[3].toInt() + 1}. "
            else -> marker
        }
        val insert = indent + next
        val t = text.substring(0, caret) + insert + text.substring(caret)
        return TextEdit(t, caret + insert.length, caret + insert.length)
    }

    /** Flips the checkbox on the given 0-based line of [text], if it has one. */
    fun toggleCheckbox(text: String, lineIndex: Int): String {
        val lines = text.split('\n').toMutableList()
        if (lineIndex !in lines.indices) return text
        val line = lines[lineIndex]
        val m = Regex("""^(\s*- \[)([ xX])(\] .*)$""").find(line) ?: return text
        val flipped = if (m.groupValues[2] == " ") "x" else " "
        lines[lineIndex] = m.groupValues[1] + flipped + m.groupValues[3]
        return lines.joinToString("\n")
    }
}
