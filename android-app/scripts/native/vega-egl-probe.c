#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <dlfcn.h>
#include <stdio.h>

#define LOAD(handle, name) \
    __typeof__(&name) name##_fn = (__typeof__(&name))dlsym(handle, #name); \
    if (!name##_fn) { fprintf(stderr, "%s: %s\n", #name, dlerror()); return 2; }

/* Standalone pbuffer probe only; does not claim an app-visible native window. */
int main(void)
{
    setvbuf(stdout, NULL, _IOLBF, 0);
    void *egl = dlopen("libEGL.so.1", RTLD_NOW | RTLD_LOCAL);
    void *gles = dlopen("libGLESv2.so.2", RTLD_NOW | RTLD_LOCAL);
    if (!egl || !gles) {
        fprintf(stderr, "EGL/GLES load failed: %s\n", dlerror());
        return 2;
    }
    LOAD(egl, eglGetDisplay);
    LOAD(egl, eglInitialize);
    LOAD(egl, eglGetError);
    LOAD(egl, eglQueryString);
    LOAD(egl, eglChooseConfig);
    LOAD(egl, eglBindAPI);
    LOAD(egl, eglCreatePbufferSurface);
    LOAD(egl, eglCreateContext);
    LOAD(egl, eglMakeCurrent);
    LOAD(egl, eglDestroySurface);
    LOAD(egl, eglDestroyContext);
    LOAD(egl, eglTerminate);
    LOAD(gles, glGetString);
    LOAD(gles, glEnable);
    LOAD(gles, glScissor);
    LOAD(gles, glClearColor);
    LOAD(gles, glClear);
    LOAD(gles, glReadPixels);
    LOAD(gles, glGetError);
    printf("EGL_CLIENT_EXTENSIONS=%s\n", eglQueryString_fn(EGL_NO_DISPLAY, EGL_EXTENSIONS));
    EGLDisplay display = eglGetDisplay_fn(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY) {
        printf("RESULT=NO_DEFAULT_DISPLAY EGL_ERROR=0x%x\n", eglGetError_fn());
        return 3;
    }
    EGLint major, minor;
    if (!eglInitialize_fn(display, &major, &minor)) {
        printf("RESULT=EGL_INITIALIZE_FAILED EGL_ERROR=0x%x\n", eglGetError_fn());
        return 4;
    }
    printf("EGL=%d.%d VENDOR=%s\n", major, minor, eglQueryString_fn(display, EGL_VENDOR));
    EGLint attributes[] = { EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_NONE };
    EGLConfig config;
    EGLint count = 0;
    EGLSurface surface = EGL_NO_SURFACE;
    EGLContext context = EGL_NO_CONTEXT;
    int result = 5;
    if (!eglChooseConfig_fn(display, attributes, &config, 1, &count) || !count ||
        !eglBindAPI_fn(EGL_OPENGL_ES_API)) goto cleanup;
    EGLint size[] = { EGL_WIDTH, 64, EGL_HEIGHT, 64, EGL_NONE };
    EGLint version[] = { EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE };
    surface = eglCreatePbufferSurface_fn(display, config, size);
    context = eglCreateContext_fn(display, config, EGL_NO_CONTEXT, version);
    if (surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT ||
        !eglMakeCurrent_fn(display, surface, surface, context)) goto cleanup;
    printf("GL_VENDOR=%s GL_RENDERER=%s GL_VERSION=%s\n", glGetString_fn(GL_VENDOR),
           glGetString_fn(GL_RENDERER), glGetString_fn(GL_VERSION));
    glEnable_fn(GL_SCISSOR_TEST);
    const GLfloat colors[4][3] = { {1, 0, 0}, {0, 1, 0}, {0, 0, 1}, {1, 1, 0} };
    result = 0;
    for (int i = 0; i < 4; i++) {
        glScissor_fn((i % 2) * 32, (i / 2) * 32, 32, 32);
        glClearColor_fn(colors[i][0], colors[i][1], colors[i][2], 1);
        glClear_fn(GL_COLOR_BUFFER_BIT);
        unsigned char pixel[4] = {0};
        glReadPixels_fn((i % 2) * 32 + 16, (i / 2) * 32 + 16, 1, 1,
                        GL_RGBA, GL_UNSIGNED_BYTE, pixel);
        for (int c = 0; c < 3; c++) {
            if (pixel[c] != (unsigned char)(colors[i][c] * 255)) result = 6;
        }
        printf("QUADRANT_%d=%u,%u,%u\n", i + 1, pixel[0], pixel[1], pixel[2]);
    }
    if (glGetError_fn() != GL_NO_ERROR) result = 7;
cleanup:
    if (result) printf("EGL_ERROR=0x%x\n", eglGetError_fn());
    eglMakeCurrent_fn(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    if (context != EGL_NO_CONTEXT) eglDestroyContext_fn(display, context);
    if (surface != EGL_NO_SURFACE) eglDestroySurface_fn(display, surface);
    eglTerminate_fn(display);
    dlclose(gles);
    dlclose(egl);
    printf("RESULT=%s; on-screen window and video texture test NOT RUN\n",
           result ? "PBUFFER_FAILED" : "FOUR_QUADRANTS_PASS");
    return result;
}
