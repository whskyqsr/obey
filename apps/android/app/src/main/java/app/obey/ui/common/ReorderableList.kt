package app.obey.ui.common

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DragHandle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

/**
 * A list whose rows can be dragged by their handle into a new order. [row] gets the item, its index and the handle
 * to place in the row (null when reordering is off). [onReorder] gets the whole list once a drag ends.
 */
@Composable
fun <T> ReorderableList(
    items: List<T>,
    key: (T) -> String,
    enabled: Boolean,
    onReorder: (List<T>) -> Unit,
    modifier: Modifier = Modifier,
    row: @Composable (item: T, index: Int, handle: (@Composable () -> Unit)?) -> Unit,
) {
    var order by remember(items) { mutableStateOf(items) }
    val haptics = LocalHapticFeedback.current
    val listState = rememberLazyListState()
    val reorderState = rememberReorderableLazyListState(listState) { from, to ->
        val fromIndex = order.indexOfFirst { key(it) == from.key }
        val toIndex = order.indexOfFirst { key(it) == to.key }
        if (fromIndex >= 0 && toIndex >= 0) order = order.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
    }
    LazyColumn(modifier, state = listState, contentPadding = PaddingValues(bottom = 88.dp)) {
        items(order, key = key) { item ->
            ReorderableItem(reorderState, key = key(item)) { dragging ->
                Surface(tonalElevation = if (dragging) 6.dp else 0.dp, shadowElevation = if (dragging) 6.dp else 0.dp) {
                    val handle: (@Composable () -> Unit)? = if (enabled) {
                        {
                            IconButton(
                                onClick = {},
                                modifier = Modifier.draggableHandle(
                                    onDragStarted = { haptics.performHapticFeedback(HapticFeedbackType.LongPress) },
                                    onDragStopped = { if (order.map(key) != items.map(key)) onReorder(order) },
                                ),
                            ) { Icon(Icons.Outlined.DragHandle, "Drag to reorder") }
                        }
                    } else null
                    row(item, order.indexOf(item), handle)
                }
            }
        }
    }
}
