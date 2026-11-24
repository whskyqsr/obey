package app.obey.ui.proof

import androidx.compose.material.icons.outlined.Check
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddAPhoto
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.ProofPhoto
import app.obey.api.ReportReason
import java.io.File

/** The ViewModel for one occurrence's photos, shared by everything showing them on a screen. */
@Composable
fun proofViewModel(occurrenceId: String): ProofViewModel = hiltViewModel<ProofViewModel>(key = "proof-$occurrenceId").also { vm ->
    LaunchedEffect(occurrenceId) { vm.load(occurrenceId) }
}

/**
 * The photos on an occurrence, blurred until opened unless the person turned that off, and an "add" tile for its
 * assignee while it's still open. The first photo asks for the 18+ and rules check.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProofPhotos(occurrenceId: String, canAdd: Boolean, modifier: Modifier = Modifier, vm: ProofViewModel = proofViewModel(occurrenceId)) {
    val photos by vm.photos.collectAsStateWithLifecycle()
    val viewer by vm.viewer.collectAsStateWithLifecycle()
    val uploading by vm.uploading.collectAsStateWithLifecycle()
    var opened by remember { mutableStateOf<ProofPhoto?>(null) }
    var askTerms by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val context = LocalContext.current
    var captureUri by remember { mutableStateOf<Uri?>(null) }
    // Errors and confirmations show as a toast: these photos sit inside other screens' sheets and dialogs.
    val message by vm.message.collectAsStateWithLifecycle()
    LaunchedEffect(message) {
        message?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); vm.messageShown() }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { vm.add(it) } }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = captureUri
        if (ok && uri != null) vm.add(uri) { context.cacheDir.resolve("proof").listFiles()?.forEach { it.delete() } }
    }
    fun takePhoto() {
        val dir = File(context.cacheDir, "proof").apply { mkdirs() }
        val file = File.createTempFile("proof", ".jpg", dir)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        captureUri = uri
        camera.launch(uri)
    }

    if (!canAdd && photos.isEmpty()) return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        photos.forEach { p -> Thumb(p, blur = viewer?.revealProofs != true, load = vm::image) { opened = p } }
        if (canAdd && photos.size < 6) {
            Box {
                Surface(
                    onClick = { if (viewer?.termsAccepted == true) menu = true else askTerms = true },
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.size(80.dp),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        if (uploading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.AddAPhoto, null, tint = MaterialTheme.colorScheme.primary)
                        Text("Photo", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Take photo") }, leadingIcon = { Icon(Icons.Outlined.PhotoCamera, null) }, onClick = { menu = false; takePhoto() })
                    DropdownMenuItem(
                        text = { Text("Choose photo") },
                        leadingIcon = { Icon(Icons.Outlined.PhotoLibrary, null) },
                        onClick = { menu = false; pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    )
                }
            }
        }
    }

    if (askTerms) ProofTermsDialog(onDismiss = { askTerms = false }, onAgree = { vm.acceptTerms { askTerms = false; menu = true } })
    opened?.let { p ->
        PhotoViewer(
            photo = p,
            mine = p.uploaderId == viewer?.userId,
            load = vm::image,
            onDelete = { vm.delete(p) { opened = null } },
            onReport = { reason, details -> vm.report(p.uploaderId, p.id, reason, details) },
            onDismiss = { opened = null },
        )
    }
}

/**
 * Blur needs Android 12; on older phones a hidden photo shows as a plain tile instead, so nothing leaks either way.
 */
@Composable
private fun Thumb(photo: ProofPhoto, blur: Boolean, load: suspend (String) -> ImageBitmap?, onOpen: () -> Unit) {
    val image by produceState<ImageBitmap?>(null, photo.id) { value = load(photo.id) }
    val canBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    Box(
        Modifier
            .size(80.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .clickable(onClick = onOpen)
            .semantics { contentDescription = if (blur) "Proof photo, hidden. Open to view" else "Proof photo. Open" },
        contentAlignment = Alignment.Center,
    ) {
        image?.let { img ->
            if (!blur || canBlur) {
                Image(img, null, contentScale = ContentScale.Crop, modifier = Modifier.size(80.dp).then(if (blur) Modifier.blur(24.dp) else Modifier))
            }
        } ?: CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        if (blur) Icon(Icons.Outlined.VisibilityOff, null)
    }
}

@Composable
private fun PhotoViewer(
    photo: ProofPhoto,
    mine: Boolean,
    load: suspend (String) -> ImageBitmap?,
    onDelete: () -> Unit,
    onReport: (ReportReason, String) -> Unit,
    onDismiss: () -> Unit,
) {
    val image by produceState<ImageBitmap?>(null, photo.id) { value = load(photo.id) }
    var reporting by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        text = {
            Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) {
                image?.let { Image(it, "Proof photo", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))) }
                    ?: CircularProgressIndicator()
            }
        },
        confirmButton = { Button(onClick = onDismiss) { Text("Close") } },
        dismissButton = {
            if (mine) TextButton(onClick = onDelete) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            else TextButton(onClick = { reporting = true }) { Text("Report") }
        },
    )
    if (reporting) ReportDialog(photo = true, onDismiss = { reporting = false }, onSubmit = { r, d -> onReport(r, d); reporting = false })
}

/** Reports go to the people running Fealty, never to the partner (mockup 93). */
@Composable
fun ReportDialog(photo: Boolean, onDismiss: () -> Unit, onSubmit: (ReportReason, String) -> Unit) {
    var reason by remember { mutableStateOf(ReportReason.Other) }
    var details by remember { mutableStateOf("") }
    val c = MaterialTheme.colorScheme
    val order = listOf(ReportReason.NonConsensual, ReportReason.Minor, ReportReason.Illegal, ReportReason.Other)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.surface,
        title = { Text("What's wrong?", style = MaterialTheme.typography.headlineMedium) },
        text = {
            Column {
                Text("Reports go to the Fealty team, not to your partner.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                order.forEach { r ->
                    Row(Modifier.fillMaxWidth().clickable { reason = r }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        app.obey.ui.common.Diamond(if (reason == r) app.obey.ui.common.DiamondState.Done else app.obey.ui.common.DiamondState.Open, size = 14.dp)
                        Text(r.label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 16.dp))
                    }
                    androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
                }
                LettersField(
                    value = details,
                    onValueChange = { details = it.take(1000) },
                    label = { Text("Anything else (optional)") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
        },
        confirmButton = { Button(onClick = { onSubmit(reason, details) }) { Text("Report") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = c.onSurface) } },
    )
}

/** The one-time 18+ and rules check before a first proof photo (mockup 92). Both boxes, no way around them. */
@Composable
fun ProofTermsDialog(onDismiss: () -> Unit, onAgree: () -> Unit) {
    var adult by remember { mutableStateOf(false) }
    var rules by remember { mutableStateOf(false) }
    val c = MaterialTheme.colorScheme
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.surface,
        title = { Text("Before your first photo", style = MaterialTheme.typography.headlineMedium) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Proof photos are only for you and your partner. They're blurred until opened and deleted after the time your dynamic set.", color = c.onSurfaceVariant)
                listOf("Only photos of yourself, with consent", "Nothing illegal, nobody under 18", "Either of you can report a photo to the Fealty team").forEach { t ->
                    Row {
                        androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Outlined.Check, null, Modifier.padding(top = 2.dp, end = 10.dp).size(16.dp), tint = c.primary)
                        Text(t, style = MaterialTheme.typography.bodyLarge)
                    }
                }
                listOf(Triple("I'm 18 or older", adult) { v: Boolean -> adult = v }, Triple("I'll follow these rules", rules) { v: Boolean -> rules = v }).forEach { (label, on, set) ->
                    Row(Modifier.fillMaxWidth().clickable { set(!on) }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(on, { set(it) }, colors = androidx.compose.material3.CheckboxDefaults.colors(checkedColor = c.onSurface, checkmarkColor = c.surface))
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                    }
                    androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
                }
            }
        },
        confirmButton = { Button(onClick = onAgree, enabled = adult && rules) { Text("Agree") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now", color = c.onSurface) } },
    )
}

/** Settings switch for the blur. Turning it off takes the switch and a confirmation, as Play asks for. */
@Composable
fun ProofBlurSetting(vm: ProofViewModel = hiltViewModel(key = "proof-settings")) {
    val viewer by vm.viewer.collectAsStateWithLifecycle()
    var confirm by remember { mutableStateOf(false) }
    androidx.compose.material3.ListItem(
        headlineContent = { Text("Blur proof photos") },
        trailingContent = {
            app.obey.ui.common.Switch(
                checked = viewer?.revealProofs != true,
                onCheckedChange = { blur -> if (!blur) confirm = true else vm.setReveal(false) },
            )
        },
    )
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Show photos unblurred?") },
            text = { Text("Proof photos will show as soon as a task opens, on this account everywhere. Anyone who can see your screen will see them too.") },
            confirmButton = { Button(onClick = { vm.setReveal(true); confirm = false }) { Text("Show them") } },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Keep blurred") } },
        )
    }
}

/** A "Report" action for a person in the dynamic. */
@Composable
fun ReportPersonButton(userId: String, text: Boolean = false, vm: ProofViewModel = hiltViewModel(key = "proof-report")) {
    var open by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val message by vm.message.collectAsStateWithLifecycle()
    LaunchedEffect(message) {
        message?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); vm.messageShown() }
    }
    if (text) {
        androidx.compose.material3.TextButton(onClick = { open = true }) { androidx.compose.material3.Text("Report", color = androidx.compose.material3.MaterialTheme.colorScheme.primary) }
    } else {
        androidx.compose.material3.IconButton(onClick = { open = true }) { Icon(Icons.Outlined.Flag, "Report") }
    }
    if (open) ReportDialog(photo = false, onDismiss = { open = false }, onSubmit = { r, d -> vm.report(userId, null, r, d); open = false })
}
