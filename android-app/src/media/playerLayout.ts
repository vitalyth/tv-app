export const CHANNEL_DRAWER_WIDTH = 312;
export const PLAYER_PANEL_INSET = 24;
export const PLAYER_PANEL_VERTICAL_INSET = 16;
export const CHANNEL_DRAWER_ANIMATION_MS = 260;

export function channelDrawerLayout(width: number, height: number) {
  const drawerWidth = Math.min(
    CHANNEL_DRAWER_WIDTH,
    Math.max(0, width - PLAYER_PANEL_INSET * 2) * 0.8,
  );
  const videoWidth = Math.max(0, width - drawerWidth - PLAYER_PANEL_INSET * 3);
  const videoHeight = width > 0 ? (height * videoWidth) / width : 0;
  return {
    drawerWidth,
    videoLeft: drawerWidth + PLAYER_PANEL_INSET * 2,
    videoTop: (height - videoHeight) / 2,
    videoWidth,
    videoHeight,
  };
}
