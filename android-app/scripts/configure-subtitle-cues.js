const fs = require('node:fs');
const path = require('node:path');

const original = `        if (!cueGroup.cues.isEmpty() && cueGroup.cues.get(0).text != null) {
            String subtitleText = cueGroup.cues.get(0).text.toString();
            eventEmitter.onTextTrackDataChanged.invoke(subtitleText);
        }`;
const replacement = `        // TVAPP_SUBTITLE_DATA: bitmap DVB cues also prove a subtitle service has data.
        for (androidx.media3.common.text.Cue cue : cueGroup.cues) {
            String text = cue.text == null ? "" : cue.text.toString();
            if (!text.trim().isEmpty() || cue.bitmap != null) {
                eventEmitter.onTextTrackDataChanged.invoke(text.trim().isEmpty() ? "\\uFFFC" : text);
                break;
            }
        }`;

function configureSubtitleCues(source) {
  if (source.includes('TVAPP_SUBTITLE_DATA')) return source;
  if (!source.includes(original)) throw new Error('Native subtitle callback changed; review cue discovery.');
  return source.replace(original, replacement);
}

if (require.main === module) {
  const filename = path.join(__dirname,
    '../node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java');
  if (fs.existsSync(filename)) {
    const source = fs.readFileSync(filename, 'utf8');
    const updated = configureSubtitleCues(source);
    if (source !== updated) fs.writeFileSync(filename, updated);
  }
}
module.exports = {configureSubtitleCues};
