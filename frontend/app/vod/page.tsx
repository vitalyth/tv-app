"use client"

import { useState, useMemo } from "react"
import { Tv, Menu, Search, X } from "lucide-react"
import { channels, categories, type Channel } from "@/lib/channels-data"
import { SidebarChannelList } from "@/components/sidebar-channel-list"
import { VideoPlayer } from "@/components/video-player"
import { ChannelCard } from "@/components/channel-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Header from "@/components/Header"

export default function TVChannelsPage() {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("הכל")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const filteredChannels = useMemo(() => {
    return channels.filter((channel) => {
      const matchesSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === "הכל" || channel.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [searchQuery, selectedCategory])

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel)
    setIsMobileSidebarOpen(false)
  }

  // When no channel is selected, show channels grid view
  if (!selectedChannel) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header */}
        <Header title="VOD"></Header>

        {/* Main content - Channels Grid */}
        <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חפש ערוץ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 bg-card border-border"
              />
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="whitespace-nowrap"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Channels Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={false}
                onClick={() => handleSelectChannel(channel)}
              />
            ))}
          </div>

          {/* No results */}
          {filteredChannels.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">לא נמצאו ערוצים</p>
              <p className="text-muted-foreground text-sm mt-2">נסה לחפש משהו אחר</p>
            </div>
          )}
        </main>
      </div>
    )
  }

  // When channel is selected, show player with sidebar
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <Header 
        title="VOD" 
        onClose={() => setSelectedChannel(null)} 
        onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}></Header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Player Area */}
        <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-6xl">
              <VideoPlayer
                channel={selectedChannel}
                onClose={() => setSelectedChannel(null)}
              />
            </div>
          </div>
        </main>

        {/* Desktop Sidebar */}
        <div className="hidden lg:flex h-full">
          <SidebarChannelList
            channels={filteredChannels}
            selectedChannel={selectedChannel}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            isCollapsed={isSidebarCollapsed}
            onSelectChannel={handleSelectChannel}
            onCategoryChange={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <div
          className={`lg:hidden fixed top-0 left-0 h-screen z-50 transition-transform duration-300 ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          <SidebarChannelList
            channels={filteredChannels}
            selectedChannel={selectedChannel}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            isCollapsed={false}
            onSelectChannel={handleSelectChannel}
            onCategoryChange={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onToggleCollapse={() => setIsMobileSidebarOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}
