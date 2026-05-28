# Local VOD Tools

Tools for preparing local TV series for tv-app streaming.

## Files

- `rename_tv_episodes.py` — Rename and organize TV episode files
- `convert_local_series_to_hls.py` — Convert local video files to HLS for streaming

---

# 1. Rename TV Episodes

Rename TV episode files to standard `SxxExx` format and organize them into season folders (`s1`, `s2`, etc).

Examples:

```text
פרק 1.mp4
→ s1/S01E01.mp4
```

```text
season 2/episode 5.mkv
→ s2/S02E05.mkv
```

```text
עונה 1/פרק 3.mp4
→ s1/S01E03.mp4
```

## Usage

### Single series

Preview only:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv/מטומטמת'
```

Apply changes:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv/מטומטמת' --apply
```

---

### Process all TV series

Process every series folder under `/tv`.

Preview:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv' --all-series
```

Apply:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv' --all-series --apply
```

---

## Detects

### English
- `S1E1`
- `S01E01`
- `1x01`
- `Season 1 Episode 1`
- `Series 1 Ep 1`
- `Session 1 Episode 1`
- `Episode 5`
- `Ep 5`
- `E5`

### Hebrew
- `עונה 1 פרק 1`
- `עונה1 פרק1`
- `ע1 פ1`
- `פרק 5`
- `פ5`

### Season from folder names
- `s1`
- `s01`
- `season 1`
- `season1`
- `series 1`
- `session1`
- `עונה 1`
- `ע1`

---

## Behavior

- Recursive scan
- Creates season folders automatically:
  - `s1`
  - `s2`
  - `s3`
- Skips hidden macOS metadata files:
  - `._*`
  - `.DS_Store`
- Skips files already correctly named
- If target file already exists → skip
- Never creates `_2`, `_3`, etc.

---

# 2. Convert Series to HLS

Convert local series files to HLS format for tv-app.

## Basic conversion

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת'
```

Output:

```text
hls/<episode>/index.m3u8
```

---

## Dry run

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --dry-run
```

---

## Force rebuild

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --force
```

---

## Transcode (better Chromecast compatibility)

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --transcode
```

---

## Include all audio tracks

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --all-audio
```

---

## Include subtitles

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --subtitles
```

---

# Adaptive Streaming

## Multi-quality adaptive HLS

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive
```

Output:

```text
hls/<episode>/master.m3u8
hls/<episode>/1080p/index.m3u8
hls/<episode>/720p/index.m3u8
hls/<episode>/480p/index.m3u8
```

---

## Adaptive with subtitles

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive --subtitles
```

---

## Limit max quality

1080p:

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive --max-height 1080
```

720p:

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive --max-height 720
```

---

## Quality tuning

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive --preset slow --crf 20
```

---

# Recommended Workflow

## Single series

Step 1 — organize episodes:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv/מטומטמת' --apply
```

Step 2 — convert to HLS:

Best compatibility:

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --transcode
```

Best streaming:

```bash
python3 convert_local_series_to_hls.py '/Volumes/Data/tv/מטומטמת' --adaptive
```

---

## Entire TV library

Organize all series:

```bash
python3 rename_tv_episodes.py '/Volumes/Data/tv' --all-series --apply
```

Then convert series as needed.

---

# Requirements

Install:

```bash
brew install ffmpeg
```

Check:

```bash
ffmpeg -version
ffprobe -version
python3 --version
```