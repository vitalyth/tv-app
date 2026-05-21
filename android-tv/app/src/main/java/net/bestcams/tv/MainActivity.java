package net.bestcams.tv;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://tv.bestcams.net/tv";
    private static final String CLOSE_TV_PLAYER_SCRIPT =
        "(() => {"
            + "const player = document.querySelector('[data-tv-player=\"true\"]');"
            + "if (!player) return false;"
            + "const fullscreenElement = document.fullscreenElement;"
            + "const fullscreenPlayer = (fullscreenElement && fullscreenElement.contains(player))"
            + " || player.closest('.player-overlay-fullscreen');"
            + "if (!fullscreenPlayer) return false;"
            + "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));"
            + "return true;"
        + "})()";

    private FrameLayout root;
    private WebView webView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 27, 32));
        webView = createWebView();
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        enterImmersiveMode();

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.rgb(7, 27, 32));
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                    return false;
                }
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }

                fullscreenView = view;
                fullscreenCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                enterImmersiveMode();
            }

            @Override
            public void onHideCustomView() {
                hideFullscreenView();
            }
        });
        return view;
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(CLOSE_TV_PLAYER_SCRIPT, result -> {
            if ("true".equals(result)) {
                if (fullscreenView != null) {
                    hideFullscreenView();
                }
                return;
            }

            if (fullscreenView != null) {
                hideFullscreenView();
                return;
            }

            if (webView.canGoBack()) {
                webView.goBack();
                return;
            }

            MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    @Override
    protected void onDestroy() {
        root.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }

    private void hideFullscreenView() {
        if (fullscreenView == null) {
            return;
        }

        root.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
        enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            return;
        }

        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
