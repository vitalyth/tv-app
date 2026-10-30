#include "vega-yuv-renderer.h"
#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>

#define EGL_FUNCTIONS(X) \
    X(eglGetDisplay) X(eglInitialize) X(eglGetError) X(eglChooseConfig) \
    X(eglBindAPI) X(eglCreatePbufferSurface) X(eglCreateContext) \
    X(eglMakeCurrent) X(eglDestroySurface) X(eglDestroyContext) X(eglTerminate)
#define GL_FUNCTIONS(X) \
    X(glCreateShader) X(glShaderSource) X(glCompileShader) X(glGetShaderiv) \
    X(glGetShaderInfoLog) X(glDeleteShader) X(glCreateProgram) X(glAttachShader) \
    X(glBindAttribLocation) X(glLinkProgram) X(glGetProgramiv) X(glGetProgramInfoLog) \
    X(glUseProgram) X(glGetUniformLocation) X(glUniform1i) X(glUniform2f) \
    X(glGenTextures) X(glActiveTexture) X(glBindTexture) X(glTexParameteri) \
    X(glPixelStorei) X(glTexImage2D) X(glTexSubImage2D) X(glViewport) \
    X(glVertexAttribPointer) X(glEnableVertexAttribArray) X(glDrawArrays) \
    X(glReadPixels) X(glGetError) X(glDeleteTextures) X(glDeleteProgram) \
    X(glGetString) X(glFlush) X(glFinish) X(glClearColor) X(glClear)
#define DECLARE(name) static __typeof__(&name) p_##name;
EGL_FUNCTIONS(DECLARE)
GL_FUNCTIONS(DECLARE)
#undef DECLARE

static int CANVAS_WIDTH = 1280, CANVAS_HEIGHT = 720;
static void *egl_library, *gl_library;
static EGLDisplay display = EGL_NO_DISPLAY;
static EGLSurface surface = EGL_NO_SURFACE;
static EGLContext context = EGL_NO_CONTEXT;
static GLuint program, textures[12];
static int frame_height, plane_pitch[3], plane_height[3];
static int current;
static int external_context;
static int custom_rect[4];
static int use_custom_rect;

static int init_textures(int width, int height, int y_pitch, int uv_pitch);

int tv_gpu_init_current(int width, int height, int y_pitch, int uv_pitch,
                        int output_width, int output_height)
{
    gl_library = dlopen("libGLESv2.so.2", RTLD_NOW | RTLD_LOCAL);
    if (!gl_library) return -1;
#define LOAD_GL_CURRENT(name) p_##name = (__typeof__(&name))dlsym(gl_library, #name); if (!p_##name) return -1;
    GL_FUNCTIONS(LOAD_GL_CURRENT)
#undef LOAD_GL_CURRENT
    external_context = 1;
    current = 1;
    CANVAS_WIDTH = output_width;
    CANVAS_HEIGHT = output_height;
    return init_textures(width, height, y_pitch, uv_pitch);
}

void tv_gpu_resize(int width, int height)
{
    CANVAS_WIDTH = width;
    CANVAS_HEIGHT = height;
}

void tv_gpu_begin_frame(void)
{
    p_glClearColor(0, 0, 0, 1);
    p_glClear(GL_COLOR_BUFFER_BIT);
}

void tv_gpu_tile_rect(int x, int y, int width, int height)
{
    custom_rect[0] = x; custom_rect[1] = y;
    custom_rect[2] = width; custom_rect[3] = height;
    use_custom_rect = 1;
}

static GLuint shader(GLenum type, const char *source)
{
    GLuint value = p_glCreateShader(type);
    p_glShaderSource(value, 1, &source, NULL);
    p_glCompileShader(value);
    GLint ok = GL_FALSE;
    p_glGetShaderiv(value, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024];
        p_glGetShaderInfoLog(value, sizeof(log), NULL, log);
        fprintf(stderr, "Shader failed: %s\n", log);
        p_glDeleteShader(value);
        return 0;
    }
    return value;
}

int tv_gpu_init(int width, int height, int y_pitch, int uv_pitch)
{
    egl_library = dlopen("libEGL.so.1", RTLD_NOW | RTLD_LOCAL);
    gl_library = dlopen("libGLESv2.so.2", RTLD_NOW | RTLD_LOCAL);
    if (!egl_library || !gl_library) return -1;
#define LOAD_EGL(name) p_##name = (__typeof__(&name))dlsym(egl_library, #name); if (!p_##name) return -1;
#define LOAD_GL(name) p_##name = (__typeof__(&name))dlsym(gl_library, #name); if (!p_##name) return -1;
    EGL_FUNCTIONS(LOAD_EGL)
    GL_FUNCTIONS(LOAD_GL)
#undef LOAD_EGL
#undef LOAD_GL
    display = p_eglGetDisplay(EGL_DEFAULT_DISPLAY);
    EGLint major, minor;
    if (display == EGL_NO_DISPLAY || !p_eglInitialize(display, &major, &minor)) return -1;
    EGLint attributes[] = { EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_NONE };
    EGLConfig config;
    EGLint count = 0;
    if (!p_eglChooseConfig(display, attributes, &config, 1, &count) || !count ||
        !p_eglBindAPI(EGL_OPENGL_ES_API)) return -1;
    EGLint size[] = { EGL_WIDTH, CANVAS_WIDTH, EGL_HEIGHT, CANVAS_HEIGHT, EGL_NONE };
    EGLint version[] = { EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE };
    surface = p_eglCreatePbufferSurface(display, config, size);
    context = p_eglCreateContext(display, config, EGL_NO_CONTEXT, version);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT ||
        !p_eglMakeCurrent(display, surface, surface, context)) return -1;
    current = 1;
    printf("GPU_RENDERER=%s VERSION=%s; offscreen %dx%d\n", p_glGetString(GL_RENDERER),
           p_glGetString(GL_VERSION), CANVAS_WIDTH, CANVAS_HEIGHT);
    return init_textures(width, height, y_pitch, uv_pitch);
}

static int init_textures(int width, int height, int y_pitch, int uv_pitch)
{
    const char *vertex_source =
        "attribute vec2 position; attribute vec2 texcoord; varying vec2 uv;"
        "void main(){uv=texcoord;gl_Position=vec4(position,0.0,1.0);}";
    const char *fragment_source =
        "precision mediump float; varying vec2 uv;"
        "uniform sampler2D plane_y,plane_u,plane_v; uniform vec2 y_scale,uv_scale;"
        "void main(){float y=1.16438356*(texture2D(plane_y,uv*y_scale).r-0.0627451);"
        "float u=texture2D(plane_u,uv*uv_scale).r-0.5019608;"
        "float v=texture2D(plane_v,uv*uv_scale).r-0.5019608;"
        "gl_FragColor=vec4(y+1.596027*v,y-0.391762*u-0.812968*v,y+2.017232*u,1.0);}";
    GLuint vertex = shader(GL_VERTEX_SHADER, vertex_source);
    GLuint fragment = shader(GL_FRAGMENT_SHADER, fragment_source);
    if (!vertex || !fragment) {
        if (vertex) p_glDeleteShader(vertex);
        if (fragment) p_glDeleteShader(fragment);
        return -1;
    }
    program = p_glCreateProgram();
    p_glAttachShader(program, vertex);
    p_glAttachShader(program, fragment);
    p_glBindAttribLocation(program, 0, "position");
    p_glBindAttribLocation(program, 1, "texcoord");
    p_glLinkProgram(program);
    p_glDeleteShader(vertex);
    p_glDeleteShader(fragment);
    GLint ok = GL_FALSE;
    p_glGetProgramiv(program, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[1024];
        p_glGetProgramInfoLog(program, sizeof(log), NULL, log);
        fprintf(stderr, "Program failed: %s\n", log);
        return -1;
    }
    p_glUseProgram(program);
    p_glUniform1i(p_glGetUniformLocation(program, "plane_y"), 0);
    p_glUniform1i(p_glGetUniformLocation(program, "plane_u"), 1);
    p_glUniform1i(p_glGetUniformLocation(program, "plane_v"), 2);
    p_glUniform2f(p_glGetUniformLocation(program, "y_scale"), (float)width / y_pitch, 1);
    p_glUniform2f(p_glGetUniformLocation(program, "uv_scale"),
                 (float)((width + 1) / 2) / uv_pitch, 1);
    frame_height = height;
    plane_pitch[0] = y_pitch;
    plane_pitch[1] = plane_pitch[2] = uv_pitch;
    plane_height[0] = height;
    plane_height[1] = plane_height[2] = (height + 1) / 2;
    p_glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    p_glGenTextures(12, textures);
    for (int i = 0; i < 12; i++) {
        p_glBindTexture(GL_TEXTURE_2D, textures[i]);
        p_glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        p_glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        p_glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        p_glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        p_glTexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, plane_pitch[i % 3],
                      plane_height[i % 3], 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, NULL);
    }
    p_glEnableVertexAttribArray(0);
    p_glEnableVertexAttribArray(1);
    return p_glGetError() == GL_NO_ERROR ? 0 : -1;
}

int tv_gpu_tile(int index, const unsigned char *y, const unsigned char *u,
                const unsigned char *v)
{
    if (index < 0 || index > 3 || !frame_height) return -1;
    const unsigned char *planes[] = {y, u, v};
    for (int i = 0; i < 3; i++) {
        p_glActiveTexture(GL_TEXTURE0 + i);
        p_glBindTexture(GL_TEXTURE_2D, textures[index * 3 + i]);
        p_glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, plane_pitch[i], plane_height[i],
                         GL_LUMINANCE, GL_UNSIGNED_BYTE, planes[i]);
    }
    const GLfloat positions[] = {-1, -1, 1, -1, -1, 1, 1, 1};
    const GLfloat coordinates[] = {0, 1, 1, 1, 0, 0, 1, 0};
    if (use_custom_rect) {
        p_glViewport(custom_rect[0], custom_rect[1], custom_rect[2], custom_rect[3]);
        use_custom_rect = 0;
    } else {
        p_glViewport((index % 2) * CANVAS_WIDTH / 2, (1 - index / 2) * CANVAS_HEIGHT / 2,
                     CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    p_glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, positions);
    p_glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 0, coordinates);
    p_glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    return p_glGetError() == GL_NO_ERROR ? 0 : -1;
}

int tv_gpu_snapshot(int second)
{
    unsigned char *pixels = malloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
    if (!pixels) return -1;
    p_glReadPixels(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
    if (p_glGetError() != GL_NO_ERROR) { free(pixels); return -1; }
    char path[80];
    snprintf(path, sizeof(path), "/tmp/tv-vlc-gpu-grid-%d.ppm", second);
    FILE *file = fopen(path, "wb");
    if (!file) { free(pixels); return -1; }
    fprintf(file, "P6\n%d %d\n255\n", CANVAS_WIDTH, CANVAS_HEIGHT);
    int result = 0;
    uint32_t hashes[4] = {2166136261u, 2166136261u, 2166136261u, 2166136261u};
    unsigned bright[4] = {0};
    static uint32_t previous[4];
    for (int y = CANVAS_HEIGHT - 1; y >= 0; y--) {
        for (int x = 0; x < CANVAS_WIDTH; x++) {
            unsigned char *pixel = pixels + (y * CANVAS_WIDTH + x) * 4;
            int tile = (1 - y / (CANVAS_HEIGHT / 2)) * 2 + x / (CANVAS_WIDTH / 2);
            for (int c = 0; c < 3; c++) hashes[tile] = (hashes[tile] ^ pixel[c]) * 16777619u;
            if (pixel[0] + pixel[1] + pixel[2] > 48) bright[tile]++;
            if (fwrite(pixel, 1, 3, file) != 3) result = -1;
        }
    }
    for (int i = 0; i < 4; i++) {
        printf("GPU_SNAPSHOT t=%d tile%d HASH=%08x NONBLACK=%u CHANGED=%d\n",
               second, i + 1, hashes[i], bright[i], hashes[i] != previous[i]);
        if (bright[i] < 100 || hashes[i] == previous[i]) result = -1;
        previous[i] = hashes[i];
    }
    if (fclose(file) != 0) result = -1;
    free(pixels);
    return result;
}

void tv_gpu_finish(void)
{
    p_glFinish();
}

int tv_gpu_present(void)
{
    p_glFlush();
    return p_glGetError() == GL_NO_ERROR ? 0 : -1;
}

void tv_gpu_close(void)
{
    if (current) {
        p_glDeleteTextures(12, textures);
        if (program) p_glDeleteProgram(program);
    }
    if (!external_context && display != EGL_NO_DISPLAY && p_eglMakeCurrent) {
        p_eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (context != EGL_NO_CONTEXT) p_eglDestroyContext(display, context);
        if (surface != EGL_NO_SURFACE) p_eglDestroySurface(display, surface);
        p_eglTerminate(display);
    }
    if (gl_library) dlclose(gl_library);
    if (egl_library) dlclose(egl_library);
    gl_library = egl_library = NULL;
    display = EGL_NO_DISPLAY; surface = EGL_NO_SURFACE; context = EGL_NO_CONTEXT;
    program = 0; current = 0; external_context = 0; frame_height = 0;
}
