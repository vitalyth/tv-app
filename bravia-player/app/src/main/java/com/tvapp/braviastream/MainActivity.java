package com.tvapp.braviastream;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
 private static final String SITE = "https://1nextbet7.tv/";
 private final Handler handler = new Handler(Looper.getMainLooper());
 private final ExecutorService network = Executors.newSingleThreadExecutor();
 private ExoPlayer player;
 private PlayerView video;
 private TextView status;
 private int generation;
 private boolean loading;
 private String channel;
 private String channelTitle;

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  android.content.SharedPreferences preferences = getSharedPreferences("playback",MODE_PRIVATE);
  channel = getIntent().getStringExtra("channel");
  if (channel == null || !channel.matches("[a-zA-Z0-9-]+")) channel = preferences.getString("channel","sport-5-max");
  channelTitle = getIntent().getStringExtra("title");
  if (channelTitle == null) channelTitle = preferences.getString("title","Sport 5 Max");
  preferences.edit().putString("channel",channel).putString("title",channelTitle).apply();
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  getWindow().getDecorView().setSystemUiVisibility(5894);
  FrameLayout frame = new FrameLayout(this);
  video = new PlayerView(this);
  frame.addView(video, new FrameLayout.LayoutParams(-1,-1));
  status = new TextView(this);
  status.setTextColor(0xffffffff); status.setTextSize(22); status.setGravity(Gravity.CENTER);
  frame.addView(status,new FrameLayout.LayoutParams(-1,-1));
  setContentView(frame);
 }
 private Map<String,String> headers() {
  Map<String,String> h = new HashMap<>();
  h.put("Referer",SITE); h.put("Origin","https://1nextbet7.tv"); h.put("Cache-Control","no-cache");
  return h;
 }
 @Override public void onStart() {
  super.onStart();
  DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
   .setUserAgent("Mozilla/5.0").setDefaultRequestProperties(headers())
   .setConnectTimeoutMs(15000).setReadTimeoutMs(15000).setAllowCrossProtocolRedirects(true);
  // The source uses a CSS suffix for HLS and caches manifests; refresh on every read.
  ResolvingDataSource.Factory source = new ResolvingDataSource.Factory(http, spec -> {
   String path = spec.uri.getPath();
   if (path != null && (path.endsWith(".css") || path.endsWith(".m3u8")))
    return spec.withUri(spec.uri.buildUpon().appendQueryParameter("_",Long.toString(System.nanoTime())).build());
   return spec;
  });
  player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(source)).build();
  video.setPlayer(player); video.requestFocus();
  player.addListener(new Player.Listener() {
   @Override public void onRenderedFirstFrame() { status.setVisibility(View.GONE); }
   @Override public void onPlayerError(PlaybackException e) {
    android.util.Log.e("BraviaStream","Playback error",e);
    status.setText("Reconnecting…"); status.setVisibility(View.VISIBLE);
    handler.postDelayed(() -> load(),3000);
   }
  });
  load();
 }
 private void load() {
  if (player == null || loading) return;
  loading = true;
  int request = generation;
  status.setText("Connecting to "+channelTitle+"…"); status.setVisibility(View.VISIBLE);
  network.execute(() -> {
   HttpURLConnection c = null;
   try {
    c = (HttpURLConnection)new URL(SITE+"ajax?method=channel_stream&stream="+channel).openConnection();
    c.setConnectTimeout(15000); c.setReadTimeout(15000);
    c.setRequestProperty("User-Agent","curl/8.7.1");
    c.setRequestProperty("Accept","*/*");
    String body;
    try (java.io.InputStream in = c.getInputStream(); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
     byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);body=out.toString("UTF-8");
    }
    JSONObject result = new JSONObject(body);
    if (!result.optBoolean("ok")) throw new IllegalStateException("Stream unavailable");
    String url = result.getString("stream");
    if (!url.startsWith("https://")) throw new IllegalStateException("Invalid stream URL");
    handler.post(() -> {
     if (request != generation || player == null) return;
     loading=false;
     player.setMediaItem(new MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build());
     player.prepare();player.play();
    });
   } catch (Exception e) {
    android.util.Log.e("BraviaStream","Stream lookup failed",e);
    handler.post(() -> {
     if (request != generation || player == null) return;
     loading=false; status.setText("Connection failed. Retrying…");
     handler.postDelayed(() -> load(),5000);
    });
   } finally { if (c != null) c.disconnect(); }
  });
 }
 @Override public void onStop() {
  generation++;loading=false;handler.removeCallbacksAndMessages(null);
  video.setPlayer(null);if(player!=null){player.release();player=null;}
  super.onStop();
 }
 @Override public void onDestroy() { network.shutdownNow();super.onDestroy(); }
}
