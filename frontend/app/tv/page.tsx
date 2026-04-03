"use client";

import { useRouter } from "next/navigation";
import { ChannelCard } from "@/components/channel-card";
import { useChannels } from "./layout";

export default function TVPage() {
  const router = useRouter();
  const channels = useChannels();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {channels.map((channel) => (
        <ChannelCard
          key={channel.id}
          channel={channel}
          isActive={false}
          onClick={() => router.push(`/tv/${channel.id}`)}
        />
      ))}
    </div>
  );
}