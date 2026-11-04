"use client";

import {useEffect, useRef, useState} from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {Captions, Check} from "lucide-react";
import {loadSubtitlePreference, preferredSubtitle, saveSubtitlePreference, SUBTITLE_PREFERENCE_KEY, type SubtitlePreference} from "@/lib/subtitle-preferences";

interface Props {
  player: any;
  closeMenu: boolean;
  onOpen: () => void;
  onInteraction?: () => void;
}

type SubtitleTrack = Pick<TextTrack, "kind" | "label" | "language" | "mode" | "cues" | "addEventListener" | "removeEventListener">;
type TrackOption = {id: string; label: string; track: SubtitleTrack};

function trackLabel(track: SubtitleTrack, index: number) {
  if (track.label) return track.label;
  if (track.language && track.language !== "und") {
    try {
      return new Intl.DisplayNames(["he"], {type: "language"}).of(track.language) || track.language;
    } catch {
      return track.language;
    }
  }
  return `כתוביות ${index + 1}`;
}

export default function SubtitleControl({player, closeMenu, onOpen, onInteraction}: Props) {
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [selected, setSelected] = useState("off");
  const [open, setOpen] = useState(false);
  const tracksRef = useRef<TrackOption[]>([]);
  const preferenceRef = useRef<SubtitlePreference>({enabled: false});
  const applyPreferenceRef = useRef<() => void>(() => {});

  useEffect(() => {
    setOpen(false);
    setTracks([]);
    tracksRef.current = [];
    setSelected("off");
    preferenceRef.current = loadSubtitlePreference();
    if (!player || player.isDisposed?.()) return;
    let list: any;
    let applying = false;
    const verified = new Set<SubtitleTrack>();
    const observed = new Set<SubtitleTrack>();
    const sync = () => {
      if (applying) return;
      const candidates: TrackOption[] = [];
      for (let index = 0; index < (list?.length ?? 0); index++) {
        const track = list[index] as SubtitleTrack;
        if (track.kind !== "captions" && track.kind !== "subtitles") continue;
        candidates.push({id: String(index), label: trackLabel(track, candidates.length), track});
        if (!observed.has(track)) {
          track.addEventListener("cuechange", sync);
          observed.add(track);
        }
        for (let cueIndex = 0; cueIndex < (track.cues?.length ?? 0); cueIndex++) {
          if ((track.cues![cueIndex] as VTTCue).text?.trim()) {verified.add(track); break;}
        }
      }
      for (const track of observed) {
        if (!candidates.some(option => option.track === track)) {
          track.removeEventListener("cuechange", sync);
          observed.delete(track);
          verified.delete(track);
        }
      }
      const options = candidates.filter(option => verified.has(option.track));
      tracksRef.current = options;
      const preferred = preferredSubtitle(options.map(option => ({...option, language: option.track.language})), preferenceRef.current);
      applying = true;
      try {
        for (const option of candidates) {
          // Hidden loads subtitle data without rendering it, so empty services
          // can be excluded even while the user's CC preference is Off.
          const mode = option.id === preferred?.id ? "showing" : "hidden";
          if (option.track.mode !== mode) option.track.mode = mode;
        }
      } finally {applying = false;}
      setTracks(previous => previous.length === options.length && previous.every((option, index) =>
        option.id === options[index].id && option.label === options[index].label && option.track === options[index].track)
        ? previous : options);
      setSelected(preferred?.id ?? "off");
      if (!options.length) setOpen(false);
    };
    const detach = () => {
      for (const event of ["addtrack", "removetrack", "change"]) list?.removeEventListener(event, sync);
    };
    const attach = () => {
      detach();
      list = player.textTracks();
      for (const event of ["addtrack", "removetrack", "change"]) list?.addEventListener(event, sync);
      sync();
    };
    const reset = () => {
      setOpen(false);
      attach();
    };
    applyPreferenceRef.current = sync;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SUBTITLE_PREFERENCE_KEY && event.key !== null) return;
      preferenceRef.current = loadSubtitlePreference();
      sync();
    };
    window.addEventListener("storage", handleStorage);
    reset();
    const probeTimer = setInterval(sync, 1000);
    player.on("loadstart", reset);
    player.on("loadedmetadata", attach);
    return () => {
      detach();
      clearInterval(probeTimer);
      for (const track of observed) track.removeEventListener("cuechange", sync);
      player.off("loadstart", reset);
      player.off("loadedmetadata", attach);
      window.removeEventListener("storage", handleStorage);
      applyPreferenceRef.current = () => {};
    };
  }, [player]);

  useEffect(() => {if (closeMenu) setOpen(false);}, [closeMenu]);

  useEffect(() => {
    if (!open) return;
    onInteraction?.();
    const timer = setInterval(() => onInteraction?.(), 1000);
    return () => clearInterval(timer);
  }, [open, onInteraction]);

  if (!tracks.length) return null;

  return (
    <Menu.Root dir="rtl" modal={false} open={open} onOpenChange={value => {
      setOpen(value);
      if (value) {onOpen(); onInteraction?.();}
    }}>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label="כתוביות"
          title="כתוביות"
          data-testid="subtitles-button"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-md flex items-center justify-center hover:bg-white/20 ${selected === "off" ? "text-white" : "text-red-500"}`}
        >
          <Captions className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </Menu.Trigger>
      <Menu.Content
          side="top" align="end" sideOffset={6}
          aria-label="בחירת כתוביות"
          onEscapeKeyDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          className="z-[90] max-h-64 min-w-36 overflow-y-auto rounded-md border border-white/10 bg-black/90 p-1 text-xs text-white shadow-xl backdrop-blur-md"
      >
        <Menu.RadioGroup value={selected} onValueChange={id => {
          const option = tracksRef.current.find(track => track.id === id);
          if (id !== "off" && !option) return;
          preferenceRef.current = {enabled: Boolean(option), language: option?.track.language, label: option?.label};
          saveSubtitlePreference(preferenceRef.current);
          applyPreferenceRef.current();
          onInteraction?.();
        }}>
          {[{id: "off", label: "כבוי"}, ...tracks].map(option => (
            <Menu.RadioItem
                key={option.id} value={option.id}
                className="relative cursor-pointer rounded px-7 py-2 outline-none data-[highlighted]:bg-white/20"
            >
              <Menu.ItemIndicator className="absolute right-1.5 top-2"><Check className="h-4 w-4" /></Menu.ItemIndicator>
              {option.label}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}
