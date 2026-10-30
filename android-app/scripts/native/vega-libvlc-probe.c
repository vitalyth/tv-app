#include <dlfcn.h>
#include <stdio.h>

/* Dependency preflight only: this does not exercise decoding or rendering. */
int main(int argc, char **argv) {
  const char *candidates[] = {"libvlc.so", "libvlc.so.12", "libvlc.so.5"};
  void *library = NULL;
  const char *loaded = NULL;

  for (unsigned i = 0; i < (argc > 1 ? 1u : 3u); ++i) {
    const char *name = argc > 1 ? argv[1] : candidates[i];
    library = dlopen(name, RTLD_NOW | RTLD_LOCAL);
    if (library) {
      loaded = name;
      break;
    }
    fprintf(stderr, "UNAVAILABLE %s: %s\n", name, dlerror());
  }
  if (!library) {
    puts("RESULT: LIBVLC_NOT_LOADABLE; four-player test NOT RUN");
    return 2;
  }

  const char *(*version)(void) =
      (const char *(*)(void))dlsym(library, "libvlc_get_version");
  const int has_memory_output = dlsym(library, "libvlc_video_set_callbacks") != NULL;
  const int has_texture_output =
      dlsym(library, "libvlc_video_set_output_callbacks") != NULL;
  printf("LOADED: %s\nVERSION: %s\nMEMORY_OUTPUT: %d\nTEXTURE_OUTPUT: %d\n",
         loaded, version ? version() : "unknown", has_memory_output,
         has_texture_output);
  puts("RESULT: dependency loaded; four-player test NOT RUN");
  dlclose(library);
  return version && has_texture_output ? 0 : 3;
}
