"use client"

import { Play, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { type Channel } from "@/lib/channels-data"

interface ChannelCardProps {
  channel: Channel
  isActive: boolean
  onClick: () => void
}

export function ChannelCard({ channel, isActive, onClick }: ChannelCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl transition-all duration-300",
        "bg-card border border-border hover:border-primary/50 hover:bg-secondary",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
        isActive && "border-primary bg-primary/10 ring-2 ring-primary"
      )}
    >
      {/* Live indicator */}
      {/*
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
        <span className="text-xs text-primary font-medium">LIVE</span>
      </div>
      */}

      {/* Channel logo */}
      <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border group-hover:border-primary/50 transition-colors">
        <span className="text-3xl font-bold text-foreground"><img src={`/ch/${channel.logo}`} /></span>
      </div>

      {/* Channel name */}
      <h3 className="text-lg font-semibold text-foreground text-center">{channel.name}</h3>

      {/* Category badge */}
      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
        {channel.programs?.[0]?.name}
      </span>

      {/* Play overlay on hover */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity",
        isActive && "opacity-0 group-hover:opacity-0"
      )}>
        <div className="flex items-center gap-2 text-primary">
          <Play className="w-8 h-8 fill-current" />
          <span className="font-semibold">צפה עכשיו</span>
        </div>
      </div>
    </button>
  )
}
