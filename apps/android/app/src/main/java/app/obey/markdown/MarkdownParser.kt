package app.obey.markdown

/** A deliberately small Markdown subset: the same things the editor toolbar can produce. */
sealed interface MdBlock {
    /** Index of the block's first line in the source, for tap-to-toggle checkboxes. */
    val line: Int

    data class Heading(override val line: Int, val level: Int, val inline: List<MdSpan>) : MdBlock
    data class Paragraph(override val line: Int, val inline: List<MdSpan>) : MdBlock
    data class Bullet(override val line: Int, val depth: Int, val inline: List<MdSpan>) : MdBlock
    data class Numbered(override val line: Int, val number: Int, val inline: List<MdSpan>) : MdBlock
    data class Check(override val line: Int, val checked: Boolean, val inline: List<MdSpan>) : MdBlock
    data class Quote(override val line: Int, val inline: List<MdSpan>) : MdBlock
    data class Rule(override val line: Int) : MdBlock
    data class Blank(override val line: Int) : MdBlock
}

data class MdSpan(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strike: Boolean = false,
    val code: Boolean = false,
)

object MarkdownParser {
    private val heading = Regex("""^(#{1,6})\s+(.*)$""")
    private val check = Regex("""^\s*[-*+] \[([ xX])\] (.*)$""")
    private val bullet = Regex("""^(\s*)[-*+] (.*)$""")
    private val numbered = Regex("""^\s*(\d+)\. (.*)$""")
    private val quote = Regex("""^> ?(.*)$""")
    private val rule = Regex("""^(-{3,}|\*{3,}|_{3,})\s*$""")

    fun parse(source: String): List<MdBlock> = source.split('\n').mapIndexed { i, line ->
        heading.find(line)?.let { return@mapIndexed MdBlock.Heading(i, it.groupValues[1].length, inline(it.groupValues[2])) }
        if (rule.matches(line)) return@mapIndexed MdBlock.Rule(i)
        check.find(line)?.let { return@mapIndexed MdBlock.Check(i, it.groupValues[1] != " ", inline(it.groupValues[2])) }
        bullet.find(line)?.let { return@mapIndexed MdBlock.Bullet(i, it.groupValues[1].length / 2, inline(it.groupValues[2])) }
        numbered.find(line)?.let { return@mapIndexed MdBlock.Numbered(i, it.groupValues[1].toIntOrNull() ?: 1, inline(it.groupValues[2])) }
        quote.find(line)?.let { return@mapIndexed MdBlock.Quote(i, inline(it.groupValues[1])) }
        if (line.isBlank()) MdBlock.Blank(i) else MdBlock.Paragraph(i, inline(line))
    }

    /** Inline parsing for **bold**, *italic* / _italic_, ~~strike~~ and `code`. Unmatched markers stay literal. */
    fun inline(text: String): List<MdSpan> {
        val out = mutableListOf<MdSpan>()
        val buf = StringBuilder()
        var bold = false
        var italic = false
        var strike = false
        fun flush() {
            if (buf.isNotEmpty()) {
                out += MdSpan(buf.toString(), bold, italic, strike)
                buf.clear()
            }
        }
        fun closes(marker: String, from: Int) = text.indexOf(marker, from) != -1

        var i = 0
        while (i < text.length) {
            val c = text[i]
            when {
                c == '\\' && i + 1 < text.length -> { buf.append(text[i + 1]); i += 2 }
                c == '`' -> {
                    val close = text.indexOf('`', i + 1)
                    if (close == -1) { buf.append(c); i++ } else {
                        flush()
                        out += MdSpan(text.substring(i + 1, close), code = true)
                        i = close + 1
                    }
                }
                text.startsWith("**", i) && (bold || closes("**", i + 2)) -> { flush(); bold = !bold; i += 2 }
                text.startsWith("~~", i) && (strike || closes("~~", i + 2)) -> { flush(); strike = !strike; i += 2 }
                (c == '*' || c == '_') && (italic || closes(c.toString(), i + 1)) &&
                    // Don't treat snake_case as emphasis.
                    !(c == '_' && i > 0 && text[i - 1].isLetterOrDigit() && !italic) -> {
                    flush(); italic = !italic; i++
                }
                else -> { buf.append(c); i++ }
            }
        }
        flush()
        return out
    }
}
