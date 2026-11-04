const {configureSubtitleCues} = require('../scripts/configure-subtitle-cues');

it('reports bitmap and text subtitle data without treating empty cues as valid', () => {
  const source = `public void onCues(CueGroup cueGroup) {
        if (!cueGroup.cues.isEmpty() && cueGroup.cues.get(0).text != null) {
            String subtitleText = cueGroup.cues.get(0).text.toString();
            eventEmitter.onTextTrackDataChanged.invoke(subtitleText);
        }
  }`;
  const patched = configureSubtitleCues(source);
  expect(patched).toContain('cue.bitmap != null');
  expect(patched).toContain('!text.trim().isEmpty()');
  expect(patched).toContain('for (androidx.media3.common.text.Cue cue');
  expect(configureSubtitleCues(patched)).toBe(patched);
  expect(() => configureSubtitleCues('changed native implementation')).toThrow('Native subtitle callback changed');
});
