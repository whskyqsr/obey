package app.obey.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import app.obey.api.ArriveOccurrenceInput
import app.obey.api.LeaveOccurrenceInput
import app.obey.api.LocationStatus
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.Place
import app.obey.api.ReportLocationInput
import app.obey.data.OfflineStore
import app.obey.data.PendingLocationReport
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import retrofit2.HttpException

/** Each dynamic's saved places, shared by Today's rows, the editor and the Places screen. */
@Singleton
class PlaceStore @Inject constructor(private val api: ObeyApi) {
    private val _byRelationship = MutableStateFlow<Map<String, List<Place>>>(emptyMap())
    val byRelationship: StateFlow<Map<String, List<Place>>> = _byRelationship.asStateFlow()

    suspend fun refresh(relationshipId: String): List<Place> =
        api.places(relationshipId).also { list -> _byRelationship.update { it + (relationshipId to list) } }

    fun put(place: Place) = _byRelationship.update { all ->
        val list = all[place.relationshipId].orEmpty().filter { it.id != place.id } + place
        all + (place.relationshipId to list.sortedBy { it.name.lowercase() })
    }

    fun remove(relationshipId: String, placeId: String) = _byRelationship.update { all ->
        all + (relationshipId to all[relationshipId].orEmpty().filter { it.id != placeId })
    }
}

/**
 * Watches the places of the signed-in person's own location tasks with Android geofences, so arriving and leaving
 * are noticed while Fealty is closed, and tells the server. Geofences are rebuilt from the server on every sync:
 * on launch, after a push, on boot, when a watched task opens and after each arrival.
 */
@Singleton
class LocationWatcher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ObeyApi,
    private val offline: OfflineStore,
) {
    private val geofencing by lazy { LocationServices.getGeofencingClient(context) }
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(context) }
    private val prefs by lazy { context.getSharedPreferences("location", Context.MODE_PRIVATE) }
    private val lock = Mutex()
    /** What the server was last told this run, so it's told again only on a change. */
    private var reported: LocationStatus? = null

    private fun granted(permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    val hasPrecise: Boolean get() = granted(Manifest.permission.ACCESS_FINE_LOCATION)
    val hasAny: Boolean get() = hasPrecise || granted(Manifest.permission.ACCESS_COARSE_LOCATION)
    val hasBackground: Boolean get() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    val servicesOn: Boolean get() = context.getSystemService(LocationManager::class.java)?.let { LocationManagerCompat.isLocationEnabled(it) } == true

    /** Geofences need precise location, allowed all the time, with the phone's location on. */
    fun status(): LocationStatus = when {
        !hasPrecise -> LocationStatus.Denied
        !servicesOn -> LocationStatus.ServicesOff
        !hasBackground -> LocationStatus.ForegroundOnly
        else -> LocationStatus.Ready
    }

    /** Set once the person has been asked for location, so someone who never was isn't reported as having refused. */
    var asked: Boolean
        get() = prefs.getBoolean("asked", false)
        set(v) = prefs.edit().putBoolean("asked", v).apply()

    private val geofencePending: PendingIntent by lazy {
        val intent = Intent(context, GeofenceReceiver::class.java)
        // Mutable: the system fills in which geofence fired.
        PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
    }

    private val wakePending: PendingIntent by lazy {
        val intent = Intent(context, LocationRefreshReceiver::class.java).setAction(LocationRefreshReceiver.ACTION_WAKE)
        PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Rebuilds the geofences; never throws, since it runs from receivers and launch. */
    suspend fun sync() {
        lock.withLock {
            try {
                syncLocked()
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                Log.w("Fealty", "Location sync failed", t)
            }
        }
    }

    private suspend fun syncLocked() {
        flushQueued()
        val status = status()
        if (status != reported && (asked || status == LocationStatus.Ready || status == LocationStatus.ForegroundOnly)) {
            api.reportLocation(ReportLocationInput(status))
            reported = status
        }
        if (status != LocationStatus.Ready) {
            geofencing.removeGeofences(geofencePending)
            return
        }
        val me = api.me()
        val now = Instant.now()
        val today = LocalDate.now()
        val arriving = mutableListOf<Geofence>()
        val staying = mutableListOf<Geofence>()
        var wake: Instant? = null
        fun wakeAt(t: Instant) {
            val w = wake
            if (t.isAfter(now) && (w == null || t.isBefore(w))) wake = t
        }

        for (rel in me.relationships) {
            if (rel.ended || !rel.features.location) continue
            val mine = rel.members.firstOrNull { it.userId == me.user.id } ?: continue
            if (mine.locationPaused) {
                mine.locationPausedUntil?.let { wakeAt(Instant.parse(it)) }
                continue
            }
            val due = api.occurrences(rel.id, today.minusDays(1).toString(), today.plusDays(1).toString(), curfew = "include")
                .filter { it.assigneeId == me.user.id && it.isPlaced && it.status == OccurrenceStatus.Pending && it.leftAt == null }
            if (due.isEmpty()) continue
            val places = api.places(rel.id).associateBy { it.id }
            for (o in due) {
                val place = places[o.placeId] ?: continue
                val dueAt = Instant.parse(o.dueAt)
                if (o.arrivedAt != null) {
                    // Watching for leaving until the stay (or the curfew) is up; the server finishes it then.
                    val until = o.stayUntil?.let { Instant.parse(it) } ?: continue
                    if (until.isAfter(now)) staying += geofence(o, place, until.plusSeconds(3600), now)
                    continue
                }
                if (!dueAt.isAfter(now)) continue
                val opens = opensAt(o)
                if (opens != null && opens.isAfter(now)) {
                    // Arriving before it opens wouldn't count, so watch from when it does.
                    wakeAt(opens)
                    continue
                }
                arriving += geofence(o, place, dueAt.plusSeconds(3600), now)
            }
        }

        geofencing.removeGeofences(geofencePending).await()
        if (arriving.isNotEmpty()) add(arriving, GeofencingRequest.INITIAL_TRIGGER_ENTER)
        if (staying.isNotEmpty()) add(staying, 0)
        scheduleWake(wake)
    }

    /** When an occurrence can first be done: its window, or the start of its first day. */
    private fun opensAt(o: Occurrence): Instant? = listOfNotNull(
        o.opensAt?.let { Instant.parse(it) },
        o.opensOn?.let { LocalDate.parse(it).atStartOfDay(ZoneId.systemDefault()).toInstant() },
    ).maxOrNull()

    private fun geofence(o: Occurrence, place: Place, until: Instant, now: Instant): Geofence = Geofence.Builder()
        .setRequestId(o.id)
        .setCircularRegion(place.lat, place.lng, place.radiusM.toFloat())
        .setExpirationDuration((until.toEpochMilli() - now.toEpochMilli()).coerceAtLeast(60_000))
        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
        // Batching saves battery; a minute or two late is fine for "by 6".
        .setNotificationResponsiveness(60_000)
        .build()

    @SuppressLint("MissingPermission") // status() checked precise and background location just before
    private suspend fun add(fences: List<Geofence>, initial: Int) {
        // Android watches at most 100 per app; the soonest are the ones that matter.
        val request = GeofencingRequest.Builder().setInitialTrigger(initial).addGeofences(fences.take(90)).build()
        geofencing.addGeofences(request, geofencePending).await()
    }

    private fun scheduleWake(at: Instant?) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        alarms.cancel(wakePending)
        // Inexact is fine: a few minutes after a task opens, the geofence goes up and catches someone already there.
        if (at != null) alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toEpochMilli() + 30_000, wakePending)
    }

    /** A geofence fired: tell the server, keeping the report for later if there's no signal. */
    suspend fun onTransition(event: GeofencingEvent) {
        val transition = event.geofenceTransition
        if (transition != Geofence.GEOFENCE_TRANSITION_ENTER && transition != Geofence.GEOFENCE_TRANSITION_EXIT) return
        val fix = event.triggeringLocation ?: if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) lastFix() else null
        val at = Instant.ofEpochMilli(fix?.time?.takeIf { it > 0 } ?: System.currentTimeMillis()).coerceAtMost(Instant.now()).toString()
        for (g in event.triggeringGeofences.orEmpty()) {
            val report = if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) {
                fix ?: continue
                PendingLocationReport(g.requestId, "enter", fix.latitude, fix.longitude, fix.accuracy.toInt(), at)
            } else {
                PendingLocationReport(g.requestId, "exit", at = at)
            }
            send(report)
        }
        sync()
    }

    private suspend fun send(r: PendingLocationReport) {
        try {
            if (r.kind == "exit") api.leave(r.occurrenceId, LeaveOccurrenceInput(r.at))
            else api.arrive(r.occurrenceId, ArriveOccurrenceInput(r.kind, r.lat ?: 0.0, r.lng ?: 0.0, r.accuracyM ?: 0, r.at))
        } catch (c: CancellationException) {
            throw c
        } catch (e: IOException) {
            offline.addLocationReport(r)
        } catch (e: HttpException) {
            // Already done, too late, or not close enough: nothing to retry.
            Log.i("Fealty", "Location report refused: ${e.code()}")
        }
    }

    /** Sends arrivals and departures noticed with no signal, in order. */
    private suspend fun flushQueued() {
        for (r in offline.locationReports()) {
            try {
                if (r.kind == "exit") api.leave(r.occurrenceId, LeaveOccurrenceInput(r.at))
                else api.arrive(r.occurrenceId, ArriveOccurrenceInput(r.kind, r.lat ?: 0.0, r.lng ?: 0.0, r.accuracyM ?: 0, r.at))
            } catch (c: CancellationException) {
                throw c
            } catch (e: IOException) {
                return
            } catch (e: HttpException) {
                Log.i("Fealty", "Queued location report refused: ${e.code()}")
            }
            offline.removeLocationReport(r)
        }
    }

    @SuppressLint("MissingPermission") // checked by hasAny
    private suspend fun lastFix(): Location? = if (!hasAny) null else runCatching { fused.lastLocation.await() }.getOrNull()

    /** One fresh fix for "I'm here"; null without permission or when the phone can't tell. */
    @SuppressLint("MissingPermission") // checked by hasAny
    suspend fun currentFix(): Location? {
        if (!hasAny) return null
        return runCatching { fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token).await() }.getOrNull()
    }
}

/** For receivers, which Hilt can't inject in Kotlin without a super call to an abstract method. */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface LocationEntryPoint {
    fun watcher(): LocationWatcher
}
