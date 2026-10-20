package app.obey.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.obey.api.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Shared plumbing: a one-shot snackbar message and a busy flag for actions. */
abstract class BaseViewModel : ViewModel() {
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    fun messageShown() {
        _message.value = null
    }

    protected fun say(text: String) {
        _message.value = text
    }

    /** Runs [block], turning failures into a snackbar message. */
    protected fun action(onError: (Throwable) -> Unit = {}, block: suspend () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            try {
                block()
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                _message.value = t.userMessage()
                onError(t)
            } finally {
                _busy.value = false
            }
        }
    }
}

/** Loading / error / content for a screen's main data. */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Failed(val message: String) : Load<Nothing>
    data class Ready<T>(val value: T) : Load<T>
}

/** Runs [block] and wraps the outcome in [Load]. */
suspend fun <T> loadCatching(block: suspend () -> T): Load<T> = try {
    Load.Ready(block())
} catch (c: CancellationException) {
    throw c
} catch (t: Throwable) {
    Load.Failed(t.userMessage())
}
