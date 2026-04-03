"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useChannels } from "../layout";
import { useRouter } from "next/navigation"

// נטען רק בצד לקוח
const VideoPlayer = dynamic(
  () => import("@/components/video-player").then((m) => m.VideoPlayer),
  { ssr: false }
);

export default function ChannelPage() {
  const params = useParams();
  const id = params.id as string;

  const channels = useChannels();

  const channel = channels.find(
    (c) => String(c.id) === String(id)
  );

  const router = useRouter()

  const handleClose = () => {
    router.push("/tv");
  };

  if (!channel) {
    return (
      <div className="flex items-center justify-center h-full">
        ערוץ לא נמצא
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-full max-w-6xl">
        <VideoPlayer channel={channel} onClose={handleClose} />
      </div>
    </div>
  );
}