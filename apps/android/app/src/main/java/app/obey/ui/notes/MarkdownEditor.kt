package app.obey.ui.notes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.CheckBoxOutlineBlank
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.FormatBold
import androidx.compose.material.icons.outlined.FormatItalic
import androidx.compose.material.icons.outlined.FormatListNumbered
import androidx.compose.material.icons.outlined.FormatQuote
import androidx.compose.material.icons.outlined.FormatStrikethrough
import androidx.compose.material.icons.outlined.Title
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.obey.markdown.LinePrefix
import app.obey.markdown.MarkdownEdits
import app.obey.markdown.MarkdownParser
import app.obey.markdown.MdBlock
import app.obey.markdown.MdSpan
import app.obey.markdown.TextEdit

private fun TextEdit.toValue() = TextFieldValue(text, TextRange(start, end))

/**
 * Applies list continuation when the change is a single typed newline; otherwise passes the change through.
 */
fun handleMarkdownInput(old: TextFieldValue, new: TextFieldValue): TextFieldValue {
    val typedNewline = new.text.length == old.text.length + 1 &&
        new.selection.collapsed && new.selection.start > 0 &&
        new.text[new.selection.start - 1] == '\n' &&
        new.text.removeRange(new.selection.start - 1, new.selection.start) == old.text
    if (!typedNewline) return new
    return MarkdownEdits.continueList(new.text, new.selection.start)?.toValue() ?: new
}

/** Formatting toolbar. Each button rewrites the Markdown source around the selection. */
@Composable
fun MarkdownToolbar(value: TextFieldValue, onChange: (TextFieldValue) -> Unit, modifier: Modifier = Modifier) {
    fun wrap(marker: String) {
        val s = value.selection
        onChange(MarkdownEdits.toggleInline(value.text, s.min, s.max, marker).toValue())
    }
    fun prefixLines(prefix: LinePrefix) {
        val s = value.selection
        onChange(MarkdownEdits.toggleLinePrefix(value.text, s.min, s.max, prefix).toValue())
    }
    fun cycleHeading() {
        val s = value.selection
        val lineStart = value.text.lastIndexOf('\n', (s.min - 1).coerceAtLeast(0)).let { if (s.min == 0) 0 else it + 1 }
        val current = value.text.substring(lineStart)
        val next = when {
            current.startsWith("# ") -> LinePrefix.Heading2
            current.startsWith("## ") -> LinePrefix.Heading3
            current.startsWith("### ") -> LinePrefix.Heading3 // toggles off
            else -> LinePrefix.Heading1
        }
        prefixLines(next)
    }

    Surface(color = MaterialTheme.colorScheme.surfaceContainer, modifier = modifier) {
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp)) {
            IconButton(onClick = { wrap("**") }) { Icon(Icons.Outlined.FormatBold, "Bold") }
            IconButton(onClick = { wrap("*") }) { Icon(Icons.Outlined.FormatItalic, "Italic") }
            IconButton(onClick = { wrap("~~") }) { Icon(Icons.Outlined.FormatStrikethrough, "Strikethrough") }
            IconButton(onClick = ::cycleHeading) { Icon(Icons.Outlined.Title, "Heading") }
            IconButton(onClick = { prefixLines(LinePrefix.Bullet) }) { Icon(Icons.AutoMirrored.Outlined.FormatListBulleted, "Bulleted list") }
            IconButton(onClick = { prefixLines(LinePrefix.Numbered) }) { Icon(Icons.Outlined.FormatListNumbered, "Numbered list") }
            IconButton(onClick = { prefixLines(LinePrefix.Checklist) }) { Icon(Icons.Outlined.Checklist, "Checklist") }
            IconButton(onClick = { prefixLines(LinePrefix.Quote) }) { Icon(Icons.Outlined.FormatQuote, "Quote") }
            IconButton(onClick = { wrap("`") }) { Icon(Icons.Outlined.Code, "Code") }
        }
    }
}

/** The editing surface: a plain-text Markdown field with live list continuation. */
@Composable
fun MarkdownField(
    value: TextFieldValue,
    onChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Write something…",
) {
    val style = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface)
    BasicTextField(
        value = value,
        onValueChange = { onChange(handleMarkdownInput(value, it)) },
        textStyle = style,
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        modifier = modifier,
        decorationBox = { inner ->
            Box {
                if (value.text.isEmpty()) {
                    Text(placeholder, style = style, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                inner()
            }
        },
    )
}

private fun MdSpan.style(codeBg: androidx.compose.ui.graphics.Color): SpanStyle = SpanStyle(
    fontWeight = if (bold) FontWeight.Bold else null,
    fontStyle = if (italic) FontStyle.Italic else null,
    textDecoration = if (strike) TextDecoration.LineThrough else null,
    fontFamily = if (code) FontFamily.Monospace else null,
    background = if (code) codeBg else androidx.compose.ui.graphics.Color.Unspecified,
)

private fun annotated(spans: List<MdSpan>, codeBg: androidx.compose.ui.graphics.Color): AnnotatedString = buildAnnotatedString {
    spans.forEach { s -> withStyle(s.style(codeBg)) { append(s.text) } }
}

/** Rendered view of [markdown]. Tapping a checklist item calls [onToggleCheck] with its source line. */
@Composable
fun MarkdownPreview(markdown: String, onToggleCheck: ((Int) -> Unit)?, modifier: Modifier = Modifier) {
    val codeBg = MaterialTheme.colorScheme.surfaceContainerHighest
    val body: TextStyle = MaterialTheme.typography.bodyLarge
    Column(modifier) {
        MarkdownParser.parse(markdown).forEach { b ->
            when (b) {
                is MdBlock.Heading -> Text(
                    annotated(b.inline, codeBg),
                    style = when (b.level) {
                        1 -> MaterialTheme.typography.headlineSmall
                        2 -> MaterialTheme.typography.titleLarge
                        else -> MaterialTheme.typography.titleMedium
                    },
                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                )
                is MdBlock.Paragraph -> Text(annotated(b.inline, codeBg), style = body, modifier = Modifier.padding(vertical = 2.dp))
                is MdBlock.Bullet -> Row(Modifier.padding(start = (8 + 16 * b.depth).dp, top = 2.dp, bottom = 2.dp)) {
                    Text("•  ", style = body)
                    Text(annotated(b.inline, codeBg), style = body)
                }
                is MdBlock.Numbered -> Row(Modifier.padding(start = 8.dp, top = 2.dp, bottom = 2.dp)) {
                    Text("${b.number}.  ", style = body)
                    Text(annotated(b.inline, codeBg), style = body)
                }
                is MdBlock.Check -> Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(enabled = onToggleCheck != null) { onToggleCheck?.invoke(b.line) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (b.checked) Icons.Outlined.CheckBox else Icons.Outlined.CheckBoxOutlineBlank,
                        contentDescription = if (b.checked) "Done" else "Not done",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        annotated(b.inline, codeBg),
                        style = body.copy(
                            textDecoration = if (b.checked) TextDecoration.LineThrough else null,
                            color = if (b.checked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                        ),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                is MdBlock.Quote -> Row(Modifier.padding(vertical = 4.dp)) {
                    Surface(color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(end = 12.dp)) {
                        androidx.compose.foundation.layout.Spacer(Modifier.padding(horizontal = 1.5.dp, vertical = 10.dp))
                    }
                    Text(annotated(b.inline, codeBg), style = body.copy(fontStyle = FontStyle.Italic))
                }
                is MdBlock.Rule -> HorizontalDivider(Modifier.padding(vertical = 8.dp))
                is MdBlock.Blank -> androidx.compose.foundation.layout.Spacer(Modifier.padding(4.dp))
            }
        }
    }
}

