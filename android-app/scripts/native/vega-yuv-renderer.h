#ifndef TV_VEGA_YUV_RENDERER_H
#define TV_VEGA_YUV_RENDERER_H

int tv_gpu_init(int width, int height, int y_pitch, int uv_pitch);
int tv_gpu_init_current(int width, int height, int y_pitch, int uv_pitch,
                        int output_width, int output_height);
void tv_gpu_resize(int width, int height);
void tv_gpu_begin_frame(void);
void tv_gpu_tile_rect(int x, int y, int width, int height);
int tv_gpu_tile(int index, const unsigned char *y, const unsigned char *u,
                const unsigned char *v);
int tv_gpu_snapshot(int second);
int tv_gpu_present(void);
void tv_gpu_finish(void);
void tv_gpu_close(void);

#endif
