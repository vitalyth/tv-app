"use client";

import Header from "@/components/Header";
import { useChannelsContext } from "./layout";
import ProgramGuide from "@/components/ProgramGuide";

export default function TVGuidePage() {
  const { channels, isLoading, error, refresh } = useChannelsContext();

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />

      {/* בלי max-width + בלי padding אנכי */}
      <main className="flex-1 flex flex-col w-full px-4 py-4 overflow-hidden" dir="ltr">
        <ProgramGuide
          channels={channels}
          logoBasePath="/ch/"
          onChannelClick={(ch) => console.log("channel clicked:", ch.name)}
          onProgramClick={(prog, ch, isLive) => console.log("program clicked:", prog, "on channel", ch, "is live?", isLive)}
        />
      </main>
    </div>
  );
}