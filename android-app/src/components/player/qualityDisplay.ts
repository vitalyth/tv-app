import type { VideoQualityOption } from '../../media/player';

export function getQualityHeight(quality: VideoQualityOption): number {
  const directHeight = Number(quality.height);
  if (Number.isFinite(directHeight) && directHeight > 0) {
    return directHeight;
  }
  const idHeight = parseInt(quality.id, 10);
  if (Number.isFinite(idHeight) && idHeight > 0) {
    return idHeight;
  }
  const labelHeight = parseInt(quality.label, 10);
  return Number.isFinite(labelHeight) && labelHeight > 0 ? labelHeight : 0;
}

export function getQualityLabel(quality: VideoQualityOption): string {
  const height = getQualityHeight(quality);
  if (height > 0) {
    return `${height}p`;
  }
  return quality.label;
}

export function getActiveVideoQuality(
  videoQualities: VideoQualityOption[],
): VideoQualityOption | undefined {
  return videoQualities.find(
    quality => quality.id !== 'auto' && quality.active,
  );
}

export function getDisplayedQualityLabel(
  selectedQualityId: string,
  videoQualities: VideoQualityOption[],
): string {
  const selectedIsAuto = !selectedQualityId || selectedQualityId === 'auto';
  if (selectedIsAuto) {
    const activeQuality = getActiveVideoQuality(videoQualities);
    return activeQuality ? getQualityLabel(activeQuality) : 'Auto';
  }

  const selectedQuality = videoQualities.find(
    quality => quality.id === selectedQualityId,
  );
  if (selectedQuality) {
    return getQualityLabel(selectedQuality);
  }

  const selectedHeight = parseInt(selectedQualityId, 10);
  return Number.isFinite(selectedHeight) && selectedHeight > 0
    ? `${selectedHeight}p`
    : selectedQualityId;
}

export function getAutoQualityLabel(
  option: VideoQualityOption,
  videoQualities: VideoQualityOption[],
): string {
  const activeQuality = getActiveVideoQuality(videoQualities);
  return activeQuality
    ? `Auto (${getQualityLabel(activeQuality)})`
    : option.label;
}
