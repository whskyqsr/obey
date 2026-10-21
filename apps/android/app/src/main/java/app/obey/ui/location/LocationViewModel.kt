package app.obey.ui.location

import androidx.lifecycle.viewModelScope
import app.obey.api.LocationStatus
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.PauseLocationInput
import app.obey.api.Place
import app.obey.api.PlaceInput
import app.obey.api.PlaceSearchResult
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.location.LocationWatcher
import app.obey.location.PlaceStore
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What the phone allows, step by step, for the setup screen. */
data class LocationSetup(val precise: Boolean, val any: Boolean, val background: Boolean, val servicesOn: Boolean) {
    val ready: Boolean get() = precise && background && servicesOn
}

/** Places, the person's own location setup and pausing; shared by the Places and Location screens and the editor. */
@HiltViewModel
class LocationViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    private val placeStore: PlaceStore,
    val watcher: LocationWatcher,
) : BaseViewModel() {
    val session: Session? get() = sessions.session
    private val relId: String? get() = sessions.session?.relationship?.id

    val places: StateFlow<List<Place>?> = placeStore.byRelationship
        .map { it[relId] }
        .stateIn(viewModelScope, SharingStarted.Eagerly, placeStore.byRelationship.value[relId])

    private val _setup = MutableStateFlow(readSetup())
    val setup: StateFlow<LocationSetup> = _setup.asStateFlow()

    private val _watching = MutableStateFlow<List<Occurrence>>(emptyList())
    /** The person's own location tasks still to do today. */
    val watching: StateFlow<List<Occurrence>> = _watching.asStateFlow()

    private val _saved = MutableStateFlow<Place?>(null)
    /** The place just added, so the editor can pick it. */
    val saved: StateFlow<Place?> = _saved.asStateFlow()
    fun savedSeen() { _saved.value = null }

    init {
        loadPlaces()
    }

    private fun readSetup() = LocationSetup(watcher.hasPrecise, watcher.hasAny, watcher.hasBackground, watcher.servicesOn)

    fun loadPlaces() {
        val id = relId ?: return
        viewModelScope.launch { runCatching { placeStore.refresh(id) } }
    }

    /** After coming back from a permission prompt or the phone's settings: re-read, and tell the server and geofences. */
    fun recheck() {
        _setup.value = readSetup()
        viewModelScope.launch {
            watcher.sync()
            sessions.refresh()
        }
        loadWatching()
    }

    fun markAsked() { watcher.asked = true }

    fun loadWatching() {
        val s = sessions.session ?: return
        val id = relId ?: return
        viewModelScope.launch {
            val today = LocalDate.now().toString()
            _watching.value = runCatching { api.occurrences(id, today, today) }.getOrDefault(emptyList())
                .filter { it.isPlaced && it.assigneeId == s.userId && it.status == OccurrenceStatus.Pending }
        }
    }

    suspend fun search(q: String, lat: Double, lng: Double): List<PlaceSearchResult> = api.searchPlaces(q, lat, lng)

    fun save(place: Place?, input: PlaceInput, onDone: () -> Unit) = action {
        val p = if (place == null) api.createPlace(relId!!, input) else api.updatePlace(place.id, input)
        placeStore.put(p)
        if (place == null) _saved.value = p
        say(if (place == null) "${p.name} added" else "Place saved")
        onDone()
    }

    fun delete(place: Place, onDone: () -> Unit) = action {
        api.deletePlace(place.id)
        placeStore.remove(place.relationshipId, place.id)
        say("Place deleted")
        onDone()
    }

    fun ask(name: String) = action {
        api.askLocation(relId!!)
        say("Asked $name to set up location")
    }

    /** [until] null pauses until it's turned back on. */
    fun pause(until: java.time.Instant?, message: String) = action {
        api.pauseLocation(relId!!, PauseLocationInput(until?.toString()))
        sessions.refresh()
        watcher.sync()
        say(message)
    }

    fun resume() = action {
        api.resumeLocation(relId!!)
        sessions.refresh()
        watcher.sync()
        say("Location is back on")
    }

    val ready: Boolean get() = watcher.status() == LocationStatus.Ready
}
