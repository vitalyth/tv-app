#include <apmf/apmf_base.h>
#include <apmf/array.h>
#include <apmf/component.h>
#include <apmf/fn.h>
#include <apmf/process.h>
#include <apmf/ptr.h>
#include <apmf/iface/com/amazon/kepler/graphics/ContextConfigAttributes.h>
#include <apmf/iface/com/amazon/kepler/graphics/IObjectFactory.h>
#include <apmf/iface/com/amazon/kepler/graphics/IGpuDevice.h>
#include <apmf/iface/com/amazon/kepler/graphics/IContext.h>
#include <apmf/iface/com/amazon/kepler/graphics/IGraphicsSurface.h>
#include <apmf/iface/com/amazon/kepler/graphics/IWindow.h>
#include <apmf/iface/com/amazon/kepler/graphics/IDisplayController.h>
#include <apmf/iface/com/amazon/kepler/graphics/PresentationMode.h>
#include <apmf/iface/com/amazon/kepler/graphics/CompressionPolicy.h>
#include <apmf/iface/com/amazon/kepler/graphics/IMediaSurface.h>
#include <apmf/iface/com/amazon/kepler/graphics/IBufferReleaseListener.h>
#include <apmf/iface/com/amazon/kepler/graphics/BufferUsage.h>
#include <apmf/iface/com/amazon/kepler/graphics/BufferPixelFormat.h>
#include <apmf/iface/com/amazon/kepler/graphics/BufferMime.h>
#include <apmf/iface/com/amazon/kepler/graphics/PresentResult.h>
#include <apmf/iface/com/amazon/kepler/graphics/MediaSurfaceQueueState.h>
#include <apmf/iface/com/amazon/kepler/buffer/IBufferGroup.h>
#include <apmf/iface/com/amazon/apmf/ISubscription.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IViewManagerFactory.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IViewManager.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IPropsDelegate.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IPropsRegistryBuilder.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/ILayoutDelegate.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IContextDelegate.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IContext.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IEventEmitter.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IPayloadDelegate.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IJsObject.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IJsObjectBuilder.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IPropsRegistry.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/ILayout.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/react/IFrame.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/view/IViewModule.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/view/ISurfaceView.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/view/ISurfaceViewListener.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/view/IKeplerWindowProvider.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/view/IKeplerMediaSurfaceProvider.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/graphics/IGraphicsModule.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/graphics/IRunLoop.h>
#include <apmf/iface/com/amazon/kepler/uitoolkit/graphics/ITask.h>

#include <array>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <stdexcept>
#include <thread>

#if TVAPP_VLC_AVAILABLE
#include <vlc/vlc.h>
extern "C" {
#include "vega-yuv-renderer.h"
}
#endif

namespace tvapp::vlcview {
using apmf::ApmfBase;
using apmf::Array;
using apmf::Ptr;
using apmf::View;
using apmf::StringView;
namespace os = apmf::iface::com::amazon::kepler::graphics;
namespace ui = apmf::iface::com::amazon::kepler::uitoolkit;
namespace rv = ui::react;
namespace uv = ui::view;
namespace ug = ui::graphics;

// The C shader helper owns one GL state set. Serialize overlapping view teardown/startup.
static std::mutex rendererMutex;

struct Config : ApmfBase<Config, os::ContextConfigAttributes> {
  int32_t numRedBits() { return 8; }
  int32_t numGreenBits() { return 8; }
  int32_t numBlueBits() { return 8; }
  int32_t numAlphaBits() { return 8; }
  int32_t numDepthBits() { return -1; }
  int32_t numStencilBits() { return -1; }
  bool needPackedDepthStencilBuffer() { return false; }
  int32_t numSamplesPerPixel() { return -1; }
  os::PresentationMode presentationMode() { return os::PresentationMode::SYSTEM_DEFAULT; }
  os::CompressionPolicy compressionPolicy() { return os::CompressionPolicy::SYSTEM_DEFAULT; }
  bool isLossyCompressionOk() { return false; }
  Array<int32_t> nativeConfigAttributes() { return {}; }
};

struct RenderUsage : ApmfBase<RenderUsage, os::BufferUsage> {
  bool scanOut() { return true; }
  bool gpuWrite() { return true; }
  bool gpuRead() { return true; }
  bool cameraWrite() { return false; }
  bool cameraRead() { return false; }
  bool secured() { return false; }
  bool softwareReadOften() { return false; }
  bool softwareReadRarely() { return false; }
  bool softwareWriteOften() { return false; }
  bool softwareWriteRarely() { return false; }
  bool hardwareVideoDecoder() { return false; }
  bool hardwareVideoEncoder() { return false; }
  bool decrypt() { return false; }
};

struct RenderBuffer {
  Ptr<apmf::iface::com::amazon::kepler::buffer::IBufferGroup> buffer;
  Ptr<os::IGraphicsSurface> surface;
  int64_t id = 0;
  std::atomic<bool> available{true};
};
using RenderPool = std::array<RenderBuffer, 3>;

struct BufferListener : ApmfBase<BufferListener, os::IBufferReleaseListener> {
  std::shared_ptr<RenderPool> pool;
  explicit BufferListener(std::shared_ptr<RenderPool> value) : pool(value) {}
  void onBufferRelease(View<apmf::iface::com::amazon::kepler::buffer::IBufferGroup> buffer) {
    const auto id = buffer->getUniqueId();
    for (auto& slot : *pool) if (slot.id == id) slot.available = true;
  }
};

struct Presentation {
  Ptr<os::IMediaSurface> media;
  Ptr<apmf::iface::com::amazon::apmf::ISubscription> subscription;
  ~Presentation() {
    try { if (media != nullptr) media->setQueueState(os::MediaSurfaceQueueState::DISCARD_WITH_CLEAR); } catch (...) {}
    try { if (subscription != nullptr) subscription->unsubscribe(); } catch (...) {}
  }
};

struct Session : std::enable_shared_from_this<Session> {
  static constexpr int width = 640, height = 360;
  std::mutex configMutex;
  std::array<std::string, 4> sources;
  std::atomic<bool> stopped{false}, paused{false};
  std::atomic<int> logicalWidth{960};
  std::atomic<uint64_t> generation{0};
  View<uv::IView> view;
  Ptr<rv::IContext> react;
  Ptr<ug::IRunLoop> uiLoop;

  ~Session() { stop(); }

  void report(int index, const std::string& state, const std::string& source, uint64_t runGeneration,
              const std::string& detail = "") {
    if (uiLoop == nullptr) return;
    auto weak = weak_from_this();
    uiLoop->scheduleTask(apmf::Fn([weak, index, state, source, runGeneration, detail](apmf::method::execute) {
      auto self = weak.lock();
      if (!self || self->stopped || self->generation != runGeneration || self->react == nullptr) return;
      {
        std::lock_guard<std::mutex> lock(self->configMutex);
        if (self->sources[index] != source) return;
      }
      self->react->getEventEmitter()->emitWithPayload(self->view, "onTileState",
        apmf::Fn([index, state, source, detail](apmf::method::getPayload, View<rv::IJsObjectBuilder> payload) {
          payload->setInt("index", index);
          payload->setString("state", state);
          payload->setString("source", source);
          payload->setString("detail", detail);
          return payload->build();
        }));
    }), nullptr, nullptr, false);
  }

  void stop() {
    stopped = true;
    generation++;
  }

#if TVAPP_VLC_AVAILABLE
  struct Tile {
    std::mutex mutex;
    unsigned char* pixels = nullptr;
    unsigned frames = 0;
    std::string source;
    libvlc_media_player_t* player = nullptr;
    bool reported = false, failed = false, paused = false;
    std::chrono::steady_clock::time_point opened;
    Tile() {
      if (posix_memalign(reinterpret_cast<void**>(&pixels), 32, width * height * 3 / 2) != 0)
        throw std::bad_alloc();
      std::memset(pixels, 16, width * height);
      std::memset(pixels + width * height, 128, width * height / 2);
    }
    ~Tile() {
      if (player) libvlc_media_player_release(player);
      std::free(pixels);
    }
  };

  static void* lockFrame(void* opaque, void** planes) {
    auto& tile = *static_cast<Tile*>(opaque);
    tile.mutex.lock();
    planes[0] = tile.pixels;
    planes[1] = tile.pixels + width * height;
    planes[2] = tile.pixels + width * height * 5 / 4;
    return nullptr;
  }
  static void unlockFrame(void* opaque, void*, void* const*) {
    auto& tile = *static_cast<Tile*>(opaque);
    tile.frames++;
    tile.mutex.unlock();
  }
  static unsigned format(void**, char* chroma, unsigned* widths, unsigned* heights,
                         unsigned* pitches, unsigned* lines) {
    std::memcpy(chroma, "I420", 4);
    widths[0] = width;
    heights[0] = height;
    pitches[0] = width; pitches[1] = pitches[2] = width / 2;
    lines[0] = height; lines[1] = lines[2] = height / 2;
    return 1;
  }

  void run(uint64_t runGeneration, Ptr<os::IMediaSurface> media) {
    std::unique_lock<std::mutex> rendering(rendererMutex);
    if (generation != runGeneration) return;
    bool gpuReady = false;
    libvlc_instance_t* instance = nullptr;
    Ptr<os::IContext> context;
    const char* stage = "graphics-factory";
    while (generation == runGeneration) {
      { std::lock_guard<std::mutex> lock(configMutex); if (!sources[0].empty()) break; }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (generation != runGeneration) return;
    try {
      // Offscreen targets share our context's device; UIKit owns the final media surface.
      auto factory = apmf::GetProcessObject()->getComponent(
          "/com.amazon.kepler.graphics.IObjectFactory").QueryInterface<os::IObjectFactory>();
      stage = "display-controller";
      auto display = factory->createDisplayControllerForSystemClients(nullptr);
      stage = "gpu-device";
      auto gpu = factory->createGpuDeviceUsingOpenGlesApi(display);
      stage = "gpu-context";
      auto config = gpu->createContextConfig(Ptr<Config>::Make());
      context = gpu->createContext(nullptr, config);
      stage = "offscreen-buffers";
      auto pool = std::make_shared<RenderPool>();
      const int outputWidth = 1280, outputHeight = 720;
      for (auto& slot : *pool) {
        slot.buffer = factory->createGraphicsBuffer(outputWidth, outputHeight,
            os::BufferPixelFormat::ARGB8888, os::BufferMime::NONE, Ptr<RenderUsage>::Make());
        slot.id = slot.buffer->getUniqueId();
        slot.surface = gpu->createOffscreenSurface(slot.buffer, config);
      }
      Presentation presentation{media, media->addBufferReleaseListener(Ptr<BufferListener>::Make(pool))};
      media->setQueueState(os::MediaSurfaceQueueState::RESUME);
      stage = "make-current";
      context->makeCurrent((*pool)[0].surface);
      stage = "shader-initialization";
      if (tv_gpu_init_current(width, height, width, width / 2,
                              outputWidth, outputHeight) != 0)
        throw std::runtime_error("GPU shader initialization failed");
      gpuReady = true;
      stage = "plugin-directory";
      Dl_info libraryInfo{};
      if (dladdr(reinterpret_cast<void*>(&lockFrame), &libraryInfo) && libraryInfo.dli_fname) {
        auto directory = std::filesystem::canonical(libraryInfo.dli_fname).parent_path();
        setenv("VLC_PLUGIN_PATH", directory.c_str(), 1);
      }
      const char* args[] = {"--no-audio", "--avcodec-threads=1", "--no-video-title-show",
                            "--no-osd", "--no-plugins-cache", "--verbose=-1"};
      stage = "vlc-initialization";
      instance = libvlc_new(sizeof(args) / sizeof(args[0]), args);
      if (!instance) throw std::runtime_error("libVLC initialization failed");
      std::array<Tile, 4> tiles;
      while (generation == runGeneration) {
        stage = "stream-playback";
        auto frameStart = std::chrono::steady_clock::now();
        std::array<std::string, 4> wanted;
        {
          std::lock_guard<std::mutex> lock(configMutex);
          wanted = sources;
        }
        int count = 1;
        for (int i = 0; i < 4; i++) if (!wanted[i].empty()) count = i + 1;
        for (int i = 0; i < 4; i++) {
          auto& tile = tiles[i];
          if (tile.source != wanted[i]) {
            if (tile.player) libvlc_media_player_release(tile.player);
            tile.player = nullptr;
            {
              std::lock_guard<std::mutex> lock(tile.mutex);
              tile.frames = 0;
              std::memset(tile.pixels, 16, width * height);
              std::memset(tile.pixels + width * height, 128, width * height / 2);
            }
            tile.source = wanted[i];
            tile.failed = tile.reported = false;
            if (!wanted[i].empty()) {
              report(i, "loading", wanted[i], runGeneration);
              auto media = wanted[i].find("://") == std::string::npos
                  ? libvlc_media_new_path(wanted[i].c_str())
                  : libvlc_media_new_location(wanted[i].c_str());
              tile.player = libvlc_media_player_new(instance, nullptr, nullptr);
              if (!media || !tile.player) {
                if (media) libvlc_media_release(media);
                throw std::runtime_error("Player allocation failed");
              }
              if (wanted[i].find("http://") == 0 || wanted[i].find("https://") == 0) {
                libvlc_media_add_option(media, ":demux=avformat");
                libvlc_media_add_option(media, ":avio-options={tls_verify=1,ca_file=/etc/ssl/certs/ca-certificates.crt,rw_timeout=5000000}");
                libvlc_media_add_option(media, ":avformat-options={tls_verify=1,ca_file=/etc/ssl/certs/ca-certificates.crt,rw_timeout=5000000}");
              }
              libvlc_media_player_set_media(tile.player, media);
              libvlc_media_release(media);
              libvlc_video_set_callbacks(tile.player, lockFrame, unlockFrame, nullptr, &tile);
              libvlc_video_set_format_callbacks(tile.player, format, nullptr);
              libvlc_media_player_play(tile.player);
              tile.paused = false;
              tile.opened = frameStart;
            }
          }
          if (tile.player && tile.paused != paused.load()) {
            tile.paused = paused;
            libvlc_media_player_set_pause(tile.player, tile.paused);
          }
          unsigned frames;
          { std::lock_guard<std::mutex> lock(tile.mutex); frames = tile.frames; }
          if (frames && !tile.reported) {
            tile.reported = true;
            report(i, "playing", tile.source, runGeneration);
          }
          if (tile.player && !tile.failed &&
              (libvlc_media_player_get_state(tile.player) == libvlc_Error ||
               (!paused && !frames && frameStart - tile.opened > std::chrono::seconds(25)))) {
            tile.failed = true;
            report(i, "error", tile.source, runGeneration,
                   frames ? "stream-playback" : "stream-startup");
          }
          if (paused) tile.opened = frameStart;
        }
        stage = "frame-presentation";
        RenderBuffer* target = nullptr;
        for (auto& slot : *pool) {
          bool available = true;
          if (slot.available.compare_exchange_strong(available, false)) { target = &slot; break; }
        }
        if (!target) {
          std::this_thread::sleep_for(std::chrono::milliseconds(5));
          continue;
        }
        auto surface = target->surface;
        context->makeCurrent(surface);
        int sw = surface->getWidth(), sh = surface->getHeight();
        Array<os::RectI> damage{{0, 0, sw, sh}};
        surface->prepareToDraw(damage);
        tv_gpu_resize(sw, sh);
        tv_gpu_begin_frame();
        double scale = static_cast<double>(sw) / std::max(1, logicalWidth.load());
        int margin = static_cast<int>(18 * scale), gap = static_cast<int>(12 * scale);
        int rows = count > 2 ? 2 : 1;
        int cellWidth = count == 1 ? sw : (sw - static_cast<int>(24 * scale)) / 2;
        int cellHeight = count == 1 ? sh : (sh - static_cast<int>(24 * scale)) / rows;
        for (int i = 0; i < count; i++) {
          auto& tile = tiles[i];
          int left = count == 1 ? 0 : margin + (i % 2) * cellWidth;
          int top = count == 1 ? 0 : margin + (i / 2) * cellHeight;
          int cw = count == 1 ? sw : cellWidth - gap;
          int ch = count == 1 ? sh : cellHeight - gap;
          double fit = std::min(static_cast<double>(cw) / width, static_cast<double>(ch) / height);
          int vw = static_cast<int>(width * fit), vh = static_cast<int>(height * fit);
          tv_gpu_tile_rect(left + (cw - vw) / 2, sh - top - (ch + vh) / 2, vw, vh);
          std::lock_guard<std::mutex> lock(tile.mutex);
          if (tv_gpu_tile(i, tile.pixels, tile.pixels + width * height,
                          tile.pixels + width * height * 5 / 4) != 0)
            throw std::runtime_error("GPU upload failed");
        }
        surface->endDraw();
        // Complete GPU writes before another display context reads this buffer.
        tv_gpu_finish();
        auto result = media->presentBuffer(target->buffer, nullptr, nullptr, 0, 0);
        if (result.value != os::PresentResult::SUBMITTED.value && result.value != os::PresentResult::QUEUED.value)
          target->available = true;
        std::this_thread::sleep_until(frameStart + std::chrono::milliseconds(40));
      }
      tv_gpu_close();
      gpuReady = false;
      context->resetCurrent();
    } catch (...) {
      std::fprintf(stderr, "[VlcMultiView] renderer stopped\n");
      for (int i = 0; i < 4; i++) {
        std::string source;
        { std::lock_guard<std::mutex> lock(configMutex); source = sources[i]; }
        if (!source.empty()) {
          try { report(i, "error", source, runGeneration, stage); } catch (...) {}
        }
      }
      if (gpuReady) tv_gpu_close();
      if (context != nullptr) { try { context->resetCurrent(); } catch (...) {} }
    }
    if (instance) libvlc_release(instance);
  }
#else
  void run(uint64_t runGeneration, Ptr<os::IMediaSurface>) {
    std::array<std::string, 4> wanted;
    { std::lock_guard<std::mutex> lock(configMutex); wanted = sources; }
    for (int i = 0; i < 4; i++) report(i, "error", wanted[i], runGeneration);
  }
#endif
};

struct Registry {
  std::map<void*, std::weak_ptr<Session>> sessions;
  ~Registry() { for (auto& item : sessions) if (auto state = item.second.lock()) state->stop(); }
};

struct SurfaceListener : ApmfBase<SurfaceListener, uv::ISurfaceViewListener> {
  std::shared_ptr<Session> session;
  explicit SurfaceListener(std::shared_ptr<Session> value) : session(value) {}
  void onSurfaceCreated(View<uv::ISurfaceView> view) {
    auto state = session;
    state->stop();
    state->stopped = false;
    auto media = view.QueryInterface<uv::IKeplerMediaSurfaceProvider>()->getMediaSurface();
    auto generation = state->generation.load();
    // VLC/network teardown stays off the UI thread; the worker retains its surface and buffers.
    std::thread([state, generation, media] {
      try { state->run(generation, media); } catch (...) {}
    }).detach();
  }
  void onSurfaceUpdated(View<uv::ISurfaceView>) {}
  void onSurfaceDestroyed(View<uv::ISurfaceView>) {
    session->stop();
  }
};

struct ViewManager : ApmfBase<ViewManager, rv::IViewManager, rv::IPropsDelegate,
                             rv::ILayoutDelegate, rv::IContextDelegate> {
  Ptr<uv::IViewModule> views;
  Ptr<ug::IRunLoop> uiLoop;
  Ptr<rv::IContext> context;
  std::shared_ptr<Registry> registry = std::make_shared<Registry>();
  ViewManager() {
    views = apmf::GetProcessObject()->getComponent("/com.amazon.kepler.uitoolkit.view")
        .QueryInterface<uv::IViewModule>();
    auto graphics = apmf::GetProcessObject()->getComponent("/com.amazon.kepler.uitoolkit.graphics")
        .QueryInterface<ug::IGraphicsModule>();
    uiLoop = graphics->tryGetUIRunLoop();
  }
  void updateContext(View<rv::IContext> value) {
    context = value;
    for (auto& entry : registry->sessions) if (auto state = entry.second.lock()) state->react = value;
  }
  Ptr<uv::IView> makeView() {
    auto state = std::make_shared<Session>();
    state->react = context;
    state->uiLoop = uiLoop;
    auto surface = views->makeMediaSurfaceView(Ptr<SurfaceListener>::Make(state));
    state->view = surface.QueryInterface<uv::IView>();
    for (auto it = registry->sessions.begin(); it != registry->sessions.end();) {
      if (it->second.expired()) it = registry->sessions.erase(it);
      else ++it;
    }
    registry->sessions.emplace(state->view.get(), state);
    return surface.QueryInterface<uv::IView>();
  }
  Ptr<rv::IPropsRegistry> registerProps(View<rv::IPropsRegistryBuilder> builder) {
    for (int i = 0; i < 4; i++) builder->stringPropWithDefault("source" + std::to_string(i), "");
    builder->boolPropWithDefault("paused", false);
    return builder->build();
  }
  void updateProps(View<uv::IView> view, View<rv::IJsObject> props) {
    auto found = registry->sessions.find(view.get());
    if (found == registry->sessions.end()) return;
    auto state = found->second.lock();
    if (!state) return;
    std::lock_guard<std::mutex> lock(state->configMutex);
    for (const auto& key : props->getAllKeys()) {
      if (key == "paused") state->paused = props->getBool(key);
      for (int i = 0; i < 4; i++) {
        if (key == "source" + std::to_string(i)) {
          auto value = props->getString(key);
          state->sources[i] = std::string(value.data(), value.size());
        }
      }
    }
  }
  void updateLayout(View<uv::IView> view, View<rv::ILayout> layout) {
    auto size = layout->getContentFrame()->getSize();
    view->setSize(size);
    auto found = registry->sessions.find(view.get());
    if (found != registry->sessions.end()) {
      if (auto state = found->second.lock()) state->logicalWidth = static_cast<int>(size.width);
    }
  }
};

struct Factory : ApmfBase<Factory, rv::IViewManagerFactory> {
  Ptr<rv::IViewManager> makeViewManager(StringView) { return Ptr<ViewManager>::Make(); }
};
}  // namespace tvapp::vlcview

APMF_COMPONENT("/com.tvapp.vlcview", tvapp::vlcview::Factory);
