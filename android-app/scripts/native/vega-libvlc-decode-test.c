#define _POSIX_C_SOURCE 200809L
#include <vlc/vlc.h>
#include <errno.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>
#include <unistd.h>

#ifndef FRAME_WIDTH
#define FRAME_WIDTH 160
#endif
#ifndef FRAME_HEIGHT
#define FRAME_HEIGHT 90
#endif
#ifndef OUTPUT_I420
#define OUTPUT_I420 0
#endif
#ifndef GPU_OUTPUT
#define GPU_OUTPUT 0
#endif
#if GPU_OUTPUT
#if !OUTPUT_I420
#error GPU output requires I420
#endif
#include "vega-yuv-renderer.h"
#endif
enum { WIDTH = FRAME_WIDTH, HEIGHT = FRAME_HEIGHT, PLAYERS = 4, SECONDS = 30 };
enum { Y_PITCH = (WIDTH + 31) & ~31, UV_PITCH = ((WIDTH + 1) / 2 + 31) & ~31,
       UV_LINES = (HEIGHT + 1) / 2, Y_BYTES = Y_PITCH * HEIGHT,
       UV_BYTES = UV_PITCH * UV_LINES,
       BUFFER_BYTES = OUTPUT_I420 ? Y_BYTES + 2 * UV_BYTES : WIDTH * HEIGHT * 4 };
struct tile {
    pthread_mutex_t mutex;
    unsigned char *pixels;
    unsigned frames;
    unsigned changes;
    uint32_t last_hash;
    libvlc_media_player_t *player;
};

static void *lock_frame(void *opaque, void **planes)
{
    struct tile *tile = opaque;
    pthread_mutex_lock(&tile->mutex);
    *planes = tile->pixels;
#if OUTPUT_I420
    planes[1] = tile->pixels + Y_BYTES;
    planes[2] = tile->pixels + Y_BYTES + UV_BYTES;
#endif
    return NULL;
}

#if OUTPUT_I420
static unsigned setup_format(void **opaque, char *chroma, unsigned *widths,
                             unsigned *heights, unsigned *pitches, unsigned *lines)
{
    (void)opaque;
    memcpy(chroma, "I420", 4);
    widths[0] = widths[1] = WIDTH;
    heights[0] = heights[1] = HEIGHT;
    pitches[0] = Y_PITCH;
    pitches[1] = pitches[2] = UV_PITCH;
    lines[0] = HEIGHT;
    lines[1] = lines[2] = UV_LINES;
    return 1;
}
#endif

static void unlock_frame(void *opaque, void *picture, void *const *planes)
{
    (void)picture;
    (void)planes;
    struct tile *tile = opaque;
    uint32_t hash = 2166136261u;
    /* Sample across the image without hashing every byte at larger sizes. */
    for (size_t i = 0; i < BUFFER_BYTES; i += 16)
        hash = (hash ^ tile->pixels[i]) * 16777619u;
    if (tile->frames && hash != tile->last_hash)
        tile->changes++;
    tile->last_hash = hash;
    tile->frames++;
    pthread_mutex_unlock(&tile->mutex);
}

static double cpu_seconds(const struct rusage *usage)
{
    return usage->ru_utime.tv_sec + usage->ru_stime.tv_sec +
        (usage->ru_utime.tv_usec + usage->ru_stime.tv_usec) / 1000000.0;
}

#if !GPU_OUTPUT
static int snapshot(struct tile *tiles, int second)
{
    char path[80];
    snprintf(path, sizeof(path), "/tmp/tv-vlc-cpu-grid-%d.ppm", second);
    FILE *file = fopen(path, "wb");
    if (!file) return -1;
    fprintf(file, "P6\n%d %d\n255\n", WIDTH * 2, HEIGHT * 2);
    for (int i = 0; i < PLAYERS; i++) pthread_mutex_lock(&tiles[i].mutex);
    for (int y = 0; y < HEIGHT * 2; y++) {
        for (int x = 0; x < WIDTH * 2; x++) {
            int index = (y / HEIGHT) * 2 + x / WIDTH;
#if OUTPUT_I420
            /* Diagnostic snapshot is luma only; U/V stay in decoder buffers. */
            unsigned char luma = tiles[index].pixels[(y % HEIGHT) * Y_PITCH + x % WIDTH];
            const unsigned char rgb[] = { luma, luma, luma };
#else
            const unsigned char *pixel = tiles[index].pixels +
                ((y % HEIGHT) * WIDTH + x % WIDTH) * 4;
            const unsigned char rgb[] = { pixel[0], pixel[1], pixel[2] };
#endif
            if (fwrite(rgb, 1, sizeof(rgb), file) != sizeof(rgb)) {
                for (int i = 0; i < PLAYERS; i++) pthread_mutex_unlock(&tiles[i].mutex);
                fclose(file);
                return -1;
            }
        }
    }
    for (int i = 0; i < PLAYERS; i++) pthread_mutex_unlock(&tiles[i].mutex);
    return fclose(file);
}
#endif

int main(int argc, char **argv)
{
    if (argc != PLAYERS + 1) {
        fprintf(stderr, "Usage: %s clip1.mp4 clip2.mp4 clip3.mp4 clip4.mp4\n", argv[0]);
        return 2;
    }
    for (int i = 1; i < argc; i++) {
        if (access(argv[i], R_OK) != 0) {
            perror(argv[i]);
            return 2;
        }
    }
    setvbuf(stdout, NULL, _IOLBF, 0);
    /* This bundle contains no hardware decoder/device plugins. */
    const char *options[] = { "--no-audio", "--avcodec-threads=1",
        "--no-video-title-show", "--no-osd", "--no-plugins-cache", "--verbose=1" };
    libvlc_instance_t *instance = libvlc_new(sizeof(options) / sizeof(options[0]), options);
    if (!instance) {
        fprintf(stderr, "libvlc_new failed: %s\n", libvlc_errmsg());
        return 3;
    }
    printf("libVLC %s; software H264 -> CPU %s %dx%d; no on-screen rendering\n", libvlc_get_version(), OUTPUT_I420 ? "I420" : "RGBA", WIDTH, HEIGHT);
    struct tile tiles[PLAYERS] = {0};
    int result = 0;
#if GPU_OUTPUT
    int gpu_started = 0;
#endif
    struct rusage before, after;
    struct timespec started, ended;
    clock_gettime(CLOCK_MONOTONIC, &started);
    getrusage(RUSAGE_SELF, &before);
#if GPU_OUTPUT
    if (tv_gpu_init(WIDTH, HEIGHT, Y_PITCH, UV_PITCH) != 0) {
        fprintf(stderr, "GPU initialization failed; try EGL_PLATFORM=surfaceless\n");
        tv_gpu_close();
        result = 10;
        goto cleanup;
    }
    gpu_started = 1;
#endif
    for (int i = 0; i < PLAYERS; i++) {
        struct tile *tile = &tiles[i];
        pthread_mutex_init(&tile->mutex, NULL);
        if (posix_memalign((void **)&tile->pixels, 32, BUFFER_BYTES) != 0) {
            result = 4;
            goto cleanup;
        }
        memset(tile->pixels, 0, BUFFER_BYTES);
        tile->player = libvlc_media_player_new(instance, NULL, NULL);
        libvlc_media_t *media = libvlc_media_new_path(argv[i + 1]);
        if (!tile->player || !media) {
            if (media) libvlc_media_release(media);
            result = 5;
            goto cleanup;
        }
        libvlc_media_player_set_media(tile->player, media);
        libvlc_media_release(media);
        libvlc_video_set_callbacks(tile->player, lock_frame, unlock_frame, NULL, tile);
#if OUTPUT_I420
        libvlc_video_set_format_callbacks(tile->player, setup_format, NULL);
#else
        libvlc_video_set_format(tile->player, "RGBA", WIDTH, HEIGHT, WIDTH * 4);
#endif
        if (libvlc_media_player_play(tile->player) != 0) {
            result = 6;
            goto cleanup;
        }
    }
    unsigned previous[PLAYERS] = {0};
    unsigned stalled[PLAYERS] = {0};
    enum { TICKS_PER_SECOND = GPU_OUTPUT ? 25 : 1 };
    for (int tick = 1; tick <= SECONDS * TICKS_PER_SECOND; tick++) {
        struct timespec deadline = started;
        deadline.tv_sec += tick / TICKS_PER_SECOND;
        deadline.tv_nsec += (tick % TICKS_PER_SECOND) * (1000000000 / TICKS_PER_SECOND);
        if (deadline.tv_nsec >= 1000000000) { deadline.tv_sec++; deadline.tv_nsec -= 1000000000; }
        int sleep_result;
        while ((sleep_result = clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &deadline, NULL)) != 0) {
            if (sleep_result != EINTR) {
                result = 9;
                goto cleanup;
            }
        }
#if GPU_OUTPUT
        for (int i = 0; i < PLAYERS; i++) {
            pthread_mutex_lock(&tiles[i].mutex);
            int render_result = tv_gpu_tile(i, tiles[i].pixels, tiles[i].pixels + Y_BYTES,
                                           tiles[i].pixels + Y_BYTES + UV_BYTES);
            pthread_mutex_unlock(&tiles[i].mutex);
            if (render_result != 0) { result = 11; goto cleanup; }
        }
        if (tv_gpu_present() != 0) { result = 11; goto cleanup; }
#endif
        if (tick % TICKS_PER_SECOND != 0) continue;
        int second = tick / TICKS_PER_SECOND;
        printf("t=%d", second);
        for (int i = 0; i < PLAYERS; i++) {
            pthread_mutex_lock(&tiles[i].mutex);
            unsigned frames = tiles[i].frames;
            unsigned changes = tiles[i].changes;
            printf(" tile%d=%u/changes=%u", i + 1, frames, changes);
            pthread_mutex_unlock(&tiles[i].mutex);
            if (second > 5 && changes == previous[i]) stalled[i]++;
            previous[i] = changes;
        }
        putchar('\n');
        if (second % 10 == 0) {
#if GPU_OUTPUT
            if (tv_gpu_snapshot(second) != 0) result = 8;
#else
            if (snapshot(tiles, second) != 0) result = 8;
#endif
        }
    }
    clock_gettime(CLOCK_MONOTONIC, &ended);
    getrusage(RUSAGE_SELF, &after);
    double wall = ended.tv_sec - started.tv_sec + (ended.tv_nsec - started.tv_nsec) / 1000000000.0;
    printf("WALL_SECONDS=%.3f CPU_SECONDS=%.3f MAX_RSS_KIB=%ld\n", wall, cpu_seconds(&after) - cpu_seconds(&before), after.ru_maxrss);
    for (int i = 0; i < PLAYERS; i++) {
        pthread_mutex_lock(&tiles[i].mutex);
        if (tiles[i].frames < 100 || tiles[i].changes < 100 || stalled[i] > 2)
            result = 7;
        printf("tile%d CHANGED_FPS=%.2f STALLED_INTERVALS=%u\n", i + 1, tiles[i].changes / wall, stalled[i]);
        pthread_mutex_unlock(&tiles[i].mutex);
    }
cleanup:
#if GPU_OUTPUT
    if (gpu_started) tv_gpu_close();
#endif
    for (int i = 0; i < PLAYERS; i++) {
        if (tiles[i].player) libvlc_media_player_release(tiles[i].player);
        free(tiles[i].pixels);
        if (tiles[i].pixels) pthread_mutex_destroy(&tiles[i].mutex);
    }
    libvlc_release(instance);
    printf("RESULT=%s; four-picture on-screen test NOT RUN\n", result ? "FAILED" :
           GPU_OUTPUT ? "FOUR_GPU_OUTPUTS_PASS" : "FOUR_CPU_DECODERS_PASS");
    return result;
}
