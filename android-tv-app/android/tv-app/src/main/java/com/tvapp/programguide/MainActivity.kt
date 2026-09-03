package com.tvapp.programguide

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tvapp.programguide.ui.ProgramGuideApp
import com.tvapp.programguide.ui.TvKeyEventBridge

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ProgramGuideApp()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (TvKeyEventBridge.dispatch(event)) return true
        return super.dispatchKeyEvent(event)
    }
}
