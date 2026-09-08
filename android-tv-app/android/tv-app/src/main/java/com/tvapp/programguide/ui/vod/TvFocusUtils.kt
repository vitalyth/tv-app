package com.tvapp.programguide.ui.vod

import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type

fun Key.isTvActivationKey(): Boolean =
    this == Key.DirectionCenter || this == Key.Enter || this == Key.NumPadEnter || this == Key.ButtonA

/**
 * Ensures single-click responsiveness on Android TV remotes without requiring double clicks.
 * Intercepts KeyDown to prevent focus loss, and triggers onClick on KeyUp.
 */
fun Modifier.tvFocusableClickable(
    onClick: () -> Unit,
    interactionSource: MutableInteractionSource,
    enabled: Boolean = true,
    focusRequester: FocusRequester? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
): Modifier {
    return this
        .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
        .onPreviewKeyEvent { event ->
            if (!enabled) return@onPreviewKeyEvent false
            when {
                event.key.isTvActivationKey() -> {
                    if (event.type == KeyEventType.KeyUp) {
                        onClick()
                    }
                    true // Consume both KeyDown and KeyUp
                }
                event.type == KeyEventType.KeyDown && event.key == Key.DirectionLeft && onNavigateLeft != null -> {
                    onNavigateLeft()
                    true
                }
                event.type == KeyEventType.KeyDown && event.key == Key.DirectionRight && onNavigateRight != null -> {
                    onNavigateRight()
                    true
                }
                event.type == KeyEventType.KeyDown && event.key == Key.DirectionUp && onNavigateUp != null -> {
                    onNavigateUp()
                    true
                }
                event.type == KeyEventType.KeyDown && event.key == Key.DirectionDown && onNavigateDown != null -> {
                    onNavigateDown()
                    true
                }
                else -> false
            }
        }
        .focusable(enabled = enabled, interactionSource = interactionSource)
        .clickable(
            enabled = enabled,
            interactionSource = interactionSource,
            indication = null,
            onClick = onClick,
        )
}
