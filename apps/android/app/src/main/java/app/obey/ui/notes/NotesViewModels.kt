package app.obey.ui.notes

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.Note
import app.obey.api.NoteInput
import app.obey.api.NoteKind
import app.obey.api.NoteVisibility
import app.obey.api.ObeyApi
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.markdown.MarkdownEdits
import app.obey.ui.NoteEditorRoute
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class NotesViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<Note>>>(Load.Loading)
    val state: StateFlow<Load<List<Note>>> = _state.asStateFlow()
    val session: Session? get() = sessions.session
    /** Journal has its own feature switch; a submissive writes notes only when their Dominant allows it. */
    fun canWrite(journal: Boolean): Boolean = journal || sessions.session?.let { it.canManage || it.relationship?.subNotes != false } ?: true

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching {
                api.notes(sessions.requireRelationshipId())
                    .sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.updatedAt })
            }
        }
    }

    /** Ticks a checklist item straight from the list's preview. */
    fun toggleCheck(note: Note, line: Int) = action {
        api.updateNote(note.id, note.toInput().copy(bodyMd = MarkdownEdits.toggleCheckbox(note.bodyMd, line)))
        refresh()
    }

    fun togglePin(note: Note) = action {
        api.updateNote(note.id, note.toInput().copy(pinned = !note.pinned))
        refresh()
    }
}

data class NoteDraft(
    val kind: NoteKind = NoteKind.Note,
    val title: String = "",
    val body: String = "",
    val visibility: NoteVisibility = NoteVisibility.Shared,
    val tags: String = "",
    val pinned: Boolean = false,
    val mood: Int? = null,
    val subCanEdit: Boolean = false,
) {
    fun toInput() = NoteInput(
        kind = kind,
        title = title.trim(),
        bodyMd = body,
        visibility = visibility,
        tags = tags.split(',').map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(20).map { it.take(40) },
        pinned = pinned,
        mood = if (kind == NoteKind.Journal) mood else null,
        subCanEdit = subCanEdit && visibility == NoteVisibility.Shared,
    )

    companion object {
        fun from(n: Note) = NoteDraft(n.kind, n.title, n.bodyMd, n.visibility, n.tags.joinToString(", "), n.pinned, n.mood, n.subCanEdit)
    }
}

@HiltViewModel
class NoteEditorViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val route = savedState.toRoute<NoteEditorRoute>()
    private val noteId: String? = route.noteId
    /** Existing notes open read-only first. */
    val opensForReading: Boolean = noteId != null
    private val blank = NoteDraft(kind = if (route.journal) NoteKind.Journal else NoteKind.Note)
    val isNew: Boolean get() = original == null

    private var original: Note? = null
    private var savedDraft = blank

    private val _load = MutableStateFlow<Load<Unit>>(if (noteId == null) Load.Ready(Unit) else Load.Loading)
    val load: StateFlow<Load<Unit>> = _load.asStateFlow()

    private val _draft = MutableStateFlow(blank)
    val draft: StateFlow<NoteDraft> = _draft.asStateFlow()

    /** The server decides: the author (unless a sub's notes are switched off), or the sub on a note opened up to them. */
    val canEdit: Boolean get() = original?.canEdit ?: true
    val isAuthor: Boolean get() = original == null || original?.authorId == sessions.session?.userId
    /** The sub a Dominant can let edit a shared note, when the dynamic has one. */
    val subName: String? get() = sessions.session?.takeIf { it.canManage }?.relationship?.members?.firstOrNull { it.role == app.obey.api.Role.Submissive }?.displayName

    private val _closed = Channel<Unit>(Channel.CONFLATED)
    val closed = _closed.receiveAsFlow()

    val dirty: Boolean get() = _draft.value != savedDraft

    init {
        if (noteId != null) load()
    }

    fun load() {
        val id = noteId ?: return
        viewModelScope.launch {
            _load.value = Load.Loading
            _load.value = loadCatching {
                val note = api.notes(sessions.requireRelationshipId()).firstOrNull { it.id == id }
                    ?: error("That note no longer exists")
                original = note
                savedDraft = NoteDraft.from(note)
                _draft.value = savedDraft
            }
        }
    }

    fun update(change: (NoteDraft) -> NoteDraft) = _draft.update(change)

    fun save(close: Boolean) {
        val d = _draft.value
        if (d.title.isBlank() && d.body.isBlank()) {
            if (close) _closed.trySend(Unit)
            return
        }
        action {
            val saved = original?.let { api.updateNote(it.id, d.toInput()) }
                ?: api.createNote(sessions.requireRelationshipId(), d.toInput())
            original = saved
            savedDraft = d
            if (close) _closed.trySend(Unit) else say("Saved")
        }
    }

    fun delete() {
        val n = original ?: run { _closed.trySend(Unit); return }
        action {
            api.deleteNote(n.id)
            _closed.trySend(Unit)
        }
    }
}
