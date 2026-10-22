package app.obey.ui.location

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.obey.api.Place
import app.obey.api.PlaceInput
import app.obey.api.PlaceSearchResult
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon

/** Free OpenStreetMap tiles from OpenFreeMap; no key or billing account. The same style as the web app. */
private const val STYLE = "https://tiles.openfreemap.org/styles/liberty"
const val MIN_RADIUS = 100
const val MAX_RADIUS = 2000

/** A polygon approximating a circle of [radiusM] metres around a point. */
private fun circle(lat: Double, lng: Double, radiusM: Int): Feature {
    val dLat = radiusM / 111_320.0
    val dLng = radiusM / (111_320.0 * cos(lat * PI / 180))
    val ring = (0..64).map { i ->
        val a = i / 64.0 * 2 * PI
        Point.fromLngLat(lng + dLng * cos(a), lat + dLat * sin(a))
    }
    return Feature.fromGeometry(Polygon.fromLngLats(listOf(ring)))
}

/** The zoom at which the circle comfortably fills the map. */
private fun zoomFor(radiusM: Int, lat: Double) = (ln(156_543.0 * cos(lat * PI / 180) * 160 / radiusM) / ln(2.0)).coerceIn(10.0, 18.0)

fun formatRadius(m: Int) = when {
    m < 1000 -> "$m m"
    m % 1000 == 0 -> "${m / 1000} km"
    else -> "${m / 1000}.${m % 1000 / 100} km"
}

/** A map with a fixed pin in the middle and the place's radius around it. Dragging the map moves the pin. */
@Composable
fun PlaceMap(lat: Double, lng: Double, radiusM: Int, onMove: (Double, Double) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val tint = MaterialTheme.colorScheme.primary.toArgb()
    val view = remember {
        MapLibre.getInstance(context)
        MapView(context).apply { onCreate(null) }
    }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    val radius by rememberUpdatedState(radiusM)
    val moved by rememberUpdatedState(onMove)

    fun redraw(m: MapLibreMap) {
        val c = m.cameraPosition.target ?: return
        m.style?.getSourceAs<GeoJsonSource>("radius")?.setGeoJson(circle(c.latitude, c.longitude, radius))
    }

    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> view.onStart()
                Lifecycle.Event.ON_RESUME -> view.onResume()
                Lifecycle.Event.ON_PAUSE -> view.onPause()
                Lifecycle.Event.ON_STOP -> view.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        view.getMapAsync { m ->
            m.uiSettings.isRotateGesturesEnabled = false
            m.uiSettings.isTiltGesturesEnabled = false
            m.cameraPosition = CameraPosition.Builder().target(LatLng(lat, lng)).zoom(zoomFor(radiusM, lat)).build()
            m.setStyle(Style.Builder().fromUri(STYLE)) { style ->
                style.addSource(GeoJsonSource("radius", circle(lat, lng, radius)))
                style.addLayer(FillLayer("radius-fill", "radius").withProperties(PropertyFactory.fillColor(tint), PropertyFactory.fillOpacity(0.14f)))
                style.addLayer(LineLayer("radius-line", "radius").withProperties(PropertyFactory.lineColor(tint), PropertyFactory.lineWidth(2f)))
            }
            m.addOnCameraMoveListener { redraw(m) }
            m.addOnCameraIdleListener { m.cameraPosition.target?.let { moved(it.latitude, it.longitude) } }
            map = m
        }
        onDispose {
            lifecycle.removeObserver(observer)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                view.onPause()
                view.onStop()
            }
            view.onDestroy()
        }
    }

    // A spot from search or "my location" recentres the map; the pin follows.
    LaunchedEffect(map, lat, lng) {
        val m = map ?: return@LaunchedEffect
        val c = m.cameraPosition.target ?: return@LaunchedEffect
        if (kotlin.math.abs(c.latitude - lat) > 1e-6 || kotlin.math.abs(c.longitude - lng) > 1e-6) {
            m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), maxOf(m.cameraPosition.zoom, zoomFor(radiusM, lat) - 1)))
        }
    }
    LaunchedEffect(map, radiusM) { map?.let(::redraw) }

    Box(modifier) {
        AndroidView({ view }, Modifier.fillMaxSize())
        // The pin's point is the middle of the map: the place.
        Icon(
            Icons.Filled.LocationOn,
            null,
            Modifier.align(Alignment.Center).offset(y = (-20).dp).size(40.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
    }
}

/** Add or change a place: search or drag the map, name it, and set how close counts. Full screen, so the map has room. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDialog(
    place: Place?,
    busy: Boolean,
    search: suspend (String, Double, Double) -> List<PlaceSearchResult>,
    locate: suspend () -> android.location.Location?,
    canLocate: () -> Boolean,
    onDismiss: () -> Unit,
    onSave: (PlaceInput) -> Unit,
    onDelete: (() -> Unit)?,
) {
    var draft by remember { mutableStateOf(place?.toInput() ?: PlaceInput(name = "", lat = 40.7128, lng = -74.006, radiusM = 150)) }
    var q by remember { mutableStateOf("") }
    var found by remember { mutableStateOf<List<PlaceSearchResult>>(emptyList()) }
    var hint by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    // What the last search came to, shown under the field: "none" or "failed".
    var outcome by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun goToMe() = scope.launch {
        val fix = locate()
        if (fix != null) draft = draft.copy(lat = fix.latitude, lng = fix.longitude) else hint = "Couldn't tell where you are; search or drag the map instead."
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { if (canLocate()) goToMe() }
    fun useMyLocation() {
        if (canLocate()) goToMe() else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }
    // A new place starts where the Dominant is, when the phone already allows it.
    LaunchedEffect(Unit) { if (place == null && canLocate()) goToMe() }
    LaunchedEffect(q) {
        found = emptyList()
        outcome = null
        searching = q.trim().length >= 3
        if (!searching) return@LaunchedEffect
        delay(350)
        val r = runCatching { search(q.trim(), draft.lat, draft.lng) }
        found = r.getOrDefault(emptyList())
        outcome = if (r.isFailure) "failed" else if (found.isEmpty()) "none" else null
        searching = false
    }
    fun pick(f: PlaceSearchResult) {
        draft = draft.copy(
            lat = f.lat,
            lng = f.lng,
            address = listOf(f.name, f.address).filter { it.isNotBlank() }.joinToString(", ").take(200),
            name = draft.name.ifBlank { f.name.take(40) },
        )
        q = ""
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(if (place == null) "New place" else "Edit place") },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, "Close") } },
                    actions = {
                        Button(onClick = { onSave(draft.copy(name = draft.name.trim())) }, enabled = !busy && draft.name.isNotBlank(), modifier = Modifier.padding(end = 8.dp)) { Text("Save") }
                    },
                )
            },
        ) { padding ->
            Column(Modifier.padding(padding).fillMaxSize().imePadding()) {
                OutlinedTextField(
                    value = q,
                    onValueChange = { q = it.take(200); hint = null },
                    leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    placeholder = { Text("Search an address or business") },
                    trailingIcon = if (searching) ({ CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }) else null,
                    supportingText = when (outcome) {
                        "failed" -> ({ Text("Search isn't working right now. Drag the map to the spot instead.") })
                        "none" -> ({ Text("No matches. Try just the street and city.") })
                        else -> null
                    },
                    isError = outcome == "failed",
                    // The keyboard's search key takes the top match.
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { found.firstOrNull()?.let(::pick) }),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                )
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    PlaceMap(draft.lat, draft.lng, draft.radiusM, onMove = { la, ln -> draft = draft.copy(lat = la, lng = ln) }, modifier = Modifier.fillMaxSize())
                    Surface(
                        color = MaterialTheme.colorScheme.inverseSurface,
                        shape = MaterialTheme.shapes.extraSmall,
                        modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
                    ) {
                        Text(
                            "Drag the map to move the pin",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.inverseOnSurface,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                    FilledTonalIconButton(onClick = ::useMyLocation, modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp)) {
                        Icon(Icons.Outlined.MyLocation, "Use my location")
                    }
                    if (found.isNotEmpty()) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceContainer,
                            shape = MaterialTheme.shapes.small,
                            shadowElevation = 3.dp,
                            modifier = Modifier.align(Alignment.TopCenter).padding(horizontal = 16.dp).fillMaxWidth(),
                        ) {
                            Column {
                                found.forEach { f ->
                                    ListItem(
                                        modifier = Modifier.clickable { pick(f) },
                                        leadingContent = { Icon(Icons.Outlined.LocationOn, null) },
                                        headlineContent = { Text(f.name) },
                                        supportingContent = if (f.address.isNotBlank()) ({ Text(f.address) }) else null,
                                    )
                                }
                            }
                        }
                    }
                }
                Column(
                    Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    OutlinedTextField(
                        value = draft.name,
                        onValueChange = { draft = draft.copy(name = it.take(40)) },
                        label = { Text("Name") },
                        placeholder = { Text("Gym, Home, Work") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Radius", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Text(formatRadius(draft.radiusM), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Slider(
                        value = draft.radiusM.toFloat(),
                        onValueChange = { draft = draft.copy(radiusM = (Math.round(it / 50f) * 50).coerceIn(MIN_RADIUS, MAX_RADIUS)) },
                        valueRange = MIN_RADIUS.toFloat()..MAX_RADIUS.toFloat(),
                    )
                    Text(
                        "Arriving anywhere inside the circle counts. At least 100 m, since phones can't tell much closer than that.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    onDelete?.let {
                        TextButton(onClick = it, enabled = !busy) { Text("Delete place", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
}
