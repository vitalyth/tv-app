import {
  channelDrawerLayout,
  PLAYER_PANEL_INSET,
} from '../src/media/playerLayout';

test.each([
  [960, 540],
  [1280, 720],
  [1920, 1080],
  [480, 270],
])(
  'channel drawer leaves a gap and fits an uncropped video in a %ix%i viewport',
  (width, height) => {
    const frame = channelDrawerLayout(width, height);
    expect(frame.videoLeft).toBeGreaterThan(
      PLAYER_PANEL_INSET + frame.drawerWidth,
    );
    expect(frame.videoLeft + frame.videoWidth).toBe(width - PLAYER_PANEL_INSET);
    expect(frame.videoHeight / frame.videoWidth).toBeCloseTo(height / width);
    expect(frame.videoTop * 2 + frame.videoHeight).toBeCloseTo(height);
    expect(frame.videoTop).toBeGreaterThan(0);
  },
);
