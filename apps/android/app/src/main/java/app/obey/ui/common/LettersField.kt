package app.obey.ui.common

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

/**
 * The Letters text field from the mockups: a small label above, the value, and one hairline under it that darkens
 * when focused. Takes the same arguments as the Material outlined field it replaces.
 */
@Composable
fun LettersField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    textStyle: TextStyle = LocalTextStyle.current,
    label: @Composable (() -> Unit)? = null,
    placeholder: @Composable (() -> Unit)? = null,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    supportingText: @Composable (() -> Unit)? = null,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
) {
    val interaction = remember { MutableInteractionSource() }
    val style = fieldStyle(textStyle, enabled)
    FieldFrame(modifier, enabled, label, supportingText, isError, interaction) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            readOnly = readOnly,
            textStyle = style,
            cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = singleLine,
            maxLines = maxLines,
            minLines = minLines,
            interactionSource = interaction,
            decorationBox = { inner -> Decoration(value.isEmpty(), placeholder, leadingIcon, trailingIcon, inner) },
        )
    }
}

/** [LettersField] for a [TextFieldValue], when the caller tracks the selection. */
@Composable
fun LettersField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    textStyle: TextStyle = LocalTextStyle.current,
    label: @Composable (() -> Unit)? = null,
    placeholder: @Composable (() -> Unit)? = null,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    supportingText: @Composable (() -> Unit)? = null,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
) {
    val interaction = remember { MutableInteractionSource() }
    val style = fieldStyle(textStyle, enabled)
    FieldFrame(modifier, enabled, label, supportingText, isError, interaction) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            readOnly = readOnly,
            textStyle = style,
            cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = singleLine,
            maxLines = maxLines,
            minLines = minLines,
            interactionSource = interaction,
            decorationBox = { inner -> Decoration(value.text.isEmpty(), placeholder, leadingIcon, trailingIcon, inner) },
        )
    }
}

@Composable
private fun fieldStyle(textStyle: TextStyle, enabled: Boolean): TextStyle {
    val base = if (textStyle == LocalTextStyle.current) MaterialTheme.typography.bodyLarge else textStyle
    val color = if (base.color.isSpecified()) base.color else MaterialTheme.colorScheme.onSurface
    return base.copy(color = if (enabled) color else color.copy(alpha = 0.4f))
}

private fun androidx.compose.ui.graphics.Color.isSpecified() = this != androidx.compose.ui.graphics.Color.Unspecified

@Composable
private fun FieldFrame(
    modifier: Modifier,
    enabled: Boolean,
    label: @Composable (() -> Unit)?,
    supportingText: @Composable (() -> Unit)?,
    isError: Boolean,
    interaction: MutableInteractionSource,
    field: @Composable () -> Unit,
) {
    val c = MaterialTheme.colorScheme
    val focused by interaction.collectIsFocusedAsState()
    Column(modifier.alpha(if (enabled) 1f else 0.6f)) {
        if (label != null) {
            CompositionLocalProvider(LocalContentColor provides if (isError) c.error else c.onSurfaceVariant, LocalTextStyle provides MaterialTheme.typography.bodySmall) {
                Box(Modifier.padding(bottom = 4.dp)) { label() }
            }
        }
        Box(Modifier.fillMaxWidth().heightIn(min = 32.dp).padding(vertical = 6.dp), contentAlignment = Alignment.CenterStart) { field() }
        HorizontalDivider(
            thickness = if (focused) 1.5.dp else 1.dp,
            color = when {
                isError -> c.error
                focused -> c.onSurface
                else -> c.outlineVariant
            },
        )
        if (supportingText != null) {
            CompositionLocalProvider(LocalContentColor provides if (isError) c.error else c.onSurfaceVariant, LocalTextStyle provides MaterialTheme.typography.bodySmall) {
                Box(Modifier.padding(top = 4.dp)) { supportingText() }
            }
        }
    }
}

@Composable
private fun Decoration(
    empty: Boolean,
    placeholder: @Composable (() -> Unit)?,
    leadingIcon: @Composable (() -> Unit)?,
    trailingIcon: @Composable (() -> Unit)?,
    inner: @Composable () -> Unit,
) {
    val c = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (leadingIcon != null) CompositionLocalProvider(LocalContentColor provides c.onSurfaceVariant) { leadingIcon() }
        Box(Modifier.weight(1f)) {
            if (empty && placeholder != null) {
                CompositionLocalProvider(LocalContentColor provides c.onSurfaceVariant.copy(alpha = 0.7f), LocalTextStyle provides MaterialTheme.typography.bodyLarge) { placeholder() }
            }
            inner()
        }
        if (trailingIcon != null) CompositionLocalProvider(LocalContentColor provides c.onSurfaceVariant) { trailingIcon() }
    }
}
