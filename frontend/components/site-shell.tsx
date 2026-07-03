"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import { APP_VERSION } from "@/lib/version";
import { FloatingPlayerProvider, useFloatingPlayer } from "@/context/floating-player-context";
import { GlobalLoadingIndicator } from "@/components/global-loading-indicator";
import { useNowSec } from "@/hooks/use-now-sec";
import { type Channel, type Program } from "@/lib/channels-data";
import { Cast, X } from "lucide-react";

const getPageTitle = (pathname: string) => {
    if (pathname === "/") return "בית";
    if (pathname.startsWith("/vod")) return "VOD";
    if (pathname.startsWith("/local-series")) return "סדרות";
    if (pathname.startsWith("/kan-vod")) return "כאן VOD";
    if (pathname.startsWith("/guide")) return "שידורים חיים";
    return "שידורים חיים";
};

function formatProgramTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
}

function resolvePanelImage(image?: string): string {
    if (!image) return "";
    if (image.startsWith("http://") || image.startsWith("https://")) return image;
    if (image.startsWith("//")) return `https:${image}`;
    if (image.startsWith("/")) return image;
    return `/ch/${image}`;
}

function resolveChannelLogo(channel: Channel | null): string {
    if (!channel) return "";

    if (channel.module === "kan-vod") {
        return "/ch/kan.jpg";
    }

    if (channel.module === "local-series" || (channel.type === "vod" && !channel.logo)) {
        return "/ch/vod.jpg";
    }

    return resolvePanelImage(channel.logo || "");
}

function useDesktopSidePanel() {
    const [isDesktopSidePanel, setIsDesktopSidePanel] = useState(false);

    useEffect(() => {
        const media = window.matchMedia("(min-width: 1024px)");
        const update = () => setIsDesktopSidePanel(media.matches);

        update();
        media.addEventListener("change", update);

        return () => media.removeEventListener("change", update);
    }, []);

    return isDesktopSidePanel;
}

function findLiveProgram(channel: Channel | null, nowSec: number): Program | null {
    if (!channel?.programs?.length) return null;
    return channel.programs.find((program) => nowSec >= program.start && nowSec < program.end) ?? null;
}

function ShellContent({
    children,
    title,
}: {
    children: React.ReactNode;
    title: string;
}) {
    const {
        currentChannel,
        programDetails,
        close,
        clearProgramDetails,
        renderPlayer,
        setDockedPlayerActive,
    } = useFloatingPlayer();
    const nowSec = useNowSec();
    const isDesktopSidePanel = useDesktopSidePanel();
    const [isSidePanelClosed, setIsSidePanelClosed] = useState(false);

    const liveProgram = useMemo(
        () => findLiveProgram(currentChannel, nowSec),
        [currentChannel, nowSec]
    );
    const panelChannel = programDetails?.channel ?? currentChannel;
    const panelProgram = programDetails?.program ?? liveProgram;
    const panelImage = resolvePanelImage(
        panelProgram?.image ||
        currentChannel?.vodMeta?.episodeImage ||
        currentChannel?.vodMeta?.programImage ||
        currentChannel?.playerLogo ||
        currentChannel?.logo
    );
    const channelLogo = resolveChannelLogo(panelChannel);
    const panelTitle =
        panelProgram?.name ||
        currentChannel?.vodMeta?.episodeName ||
        currentChannel?.playerSubtitle ||
        panelChannel?.name ||
        "";
    const panelSubtitle = panelProgram
        ? `${panelChannel?.name || ""} · ${formatProgramTime(panelProgram.start)} - ${formatProgramTime(panelProgram.end)}`
        : currentChannel?.vodMeta
            ? [currentChannel.vodMeta.channelName, currentChannel.vodMeta.seasonName].filter(Boolean).join(" · ")
            : panelChannel?.name || "";
    const panelDescription =
        panelProgram?.description ||
        currentChannel?.vodMeta?.episodeDescription ||
        currentChannel?.vodMeta?.programDescription ||
        "אין תיאור זמין לתוכנית הזו.";
    const shouldShowSidePanel = isDesktopSidePanel && !isSidePanelClosed && Boolean(panelChannel);
    const shouldDockPlayer = shouldShowSidePanel && Boolean(currentChannel);
    const isPlaybackPanel = Boolean(currentChannel && !programDetails);
    const isLivePlaybackPanel = Boolean(isPlaybackPanel && currentChannel?.type !== "vod");

    useEffect(() => {
        if (currentChannel || programDetails) {
            setIsSidePanelClosed(false);
        }
    }, [currentChannel, programDetails]);

    useEffect(() => {
        setDockedPlayerActive(shouldDockPlayer);

        return () => setDockedPlayerActive(false);
    }, [setDockedPlayerActive, shouldDockPlayer]);

    useEffect(() => {
        const className = "floating-player-mobile-portrait-active";
        const isMobileProgramDetailsOpen = Boolean(programDetails) && !isDesktopSidePanel;

        document.documentElement.classList.toggle(className, isMobileProgramDetailsOpen);

        return () => {
            if (isMobileProgramDetailsOpen) {
                document.documentElement.classList.remove(className);
            }
        };
    }, [isDesktopSidePanel, programDetails]);

    const closeSidePanel = useCallback(() => {
        setIsSidePanelClosed(true);
        clearProgramDetails();
        close();
    }, [clearProgramDetails, close]);

    return (
        <div className={`app-shell flex h-dvh flex-col bg-background ${shouldShowSidePanel ? "site-shell--side-panel-open" : ""}`}>
            <Header title={title} />

            <main
                dir="ltr"
                className={`min-h-0 flex-1 overflow-hidden ${shouldShowSidePanel ? "grid gap-3 py-4 pl-4 pr-0 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]" : "flex flex-col"}`}
            >
                <div dir="rtl" className="site-content min-h-0 flex-1 flex flex-col overflow-hidden">
                    {children}
                </div>

                {shouldShowSidePanel && panelChannel && (
                    <aside
                        dir="rtl"
                        className={`program-side-panel ${isPlaybackPanel ? "program-side-panel--playback" : ""}`}
                    >
                        <div dir="rtl" className="program-side-panel__topbar">
                            <div className="flex min-w-0 items-center gap-3">
                                {channelLogo && (
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                                        <img
                                            src={channelLogo}
                                            alt=""
                                            className="h-full w-full object-contain"
                                            loading="lazy"
                                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                )}
                                <div className="min-w-0 text-right">
                                    <p className="truncate text-sm font-bold leading-5 text-white">
                                        {panelChannel.name}
                                    </p>
                                    {panelSubtitle && (
                                        <p className="flex min-w-0 items-center justify-end gap-1.5 truncate text-xs leading-5 text-white/70">
                                            {isLivePlaybackPanel && (
                                                <span className="relative flex h-2 w-2 shrink-0">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                                </span>
                                            )}
                                            {panelSubtitle}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                                {isPlaybackPanel && (
                                    <Cast className="h-4 w-4 text-white/55" aria-hidden="true" />
                                )}
                                <button
                                    type="button"
                                    onClick={closeSidePanel}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/45 hover:text-white"
                                    aria-label="סגור פאנל"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        <div className="program-side-panel__scroll">
                            <section className={`program-side-panel__hero ${isPlaybackPanel ? "program-side-panel__hero--playback" : ""}`}>
                                {panelImage && (
                                    <>
                                        <img
                                            key={`${panelImage}-fill`}
                                            src={panelImage}
                                            alt=""
                                            className="program-side-panel__image-fill"
                                            loading="lazy"
                                            onLoad={(event) => { (event.currentTarget as HTMLImageElement).style.display = ""; }}
                                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                        <img
                                            key={`${panelImage}-main`}
                                            src={panelImage}
                                            alt=""
                                            className={`program-side-panel__image-main ${isLivePlaybackPanel ? "program-side-panel__image-main--live" : ""}`}
                                            loading="lazy"
                                            onLoad={(event) => { (event.currentTarget as HTMLImageElement).style.display = ""; }}
                                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </>
                                )}
                                <div className="program-side-panel__scrim" />
                                <div className="program-side-panel__fade" />
                                <div className={`program-side-panel__copy ${isPlaybackPanel ? "program-side-panel__copy--playback" : ""}`}>
                                    <h2 className="text-2xl font-bold leading-8 text-foreground">
                                        {panelTitle}
                                    </h2>
                                    <p className="program-side-panel__description mt-3 line-clamp-5 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                                        {panelDescription}
                                    </p>
                                </div>
                            </section>
                        </div>

                        {currentChannel && !programDetails && (
                            <div className="program-side-panel__player">
                                <div className="program-side-panel__player-bridge" />
                                <div className="program-side-panel__player-frame">
                                    {renderPlayer("h-full w-full", { hideTopControls: true })}
                                </div>
                            </div>
                        )}
                    </aside>
                )}
            </main>

            {programDetails && !isDesktopSidePanel && (
                <div dir="rtl" className="player-overlay program-details-overlay border border-border bg-background">
                    <button
                        type="button"
                        onClick={clearProgramDetails}
                        className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/45 text-white transition-colors hover:bg-black/65"
                        aria-label="סגור פרטי תוכנית"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {panelImage && (
                        <img
                            key={`${panelImage}-mobile`}
                            src={panelImage}
                            alt=""
                            className="h-1/2 w-full bg-muted object-cover"
                            loading="lazy"
                            onLoad={(event) => { (event.currentTarget as HTMLImageElement).style.display = ""; }}
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    )}
                    <div className={`${panelImage ? "h-1/2" : "h-full"} overflow-y-auto p-4 text-right`}>
                        <h2 className="text-base font-bold leading-6 text-foreground sm:text-xl sm:leading-7">
                            {panelTitle}
                        </h2>
                        {panelSubtitle && (
                            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                                {panelSubtitle}
                            </p>
                        )}
                        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                            {panelDescription}
                        </p>
                    </div>
                </div>
            )}

            <footer className="shrink-0 border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                TV App · v{APP_VERSION}
            </footer>
        </div>
    );
}

export default function SiteShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLiveRoute = pathname === "/live" || pathname.startsWith("/live/");
    const title = getPageTitle(pathname);

    useEffect(() => {
        if (isLiveRoute) return;

        const updateHeaderHeight = () => {
            const header = document.querySelector<HTMLElement>(".site-header");
            if (!header) return;

            document.documentElement.style.setProperty(
                "--site-header-height",
                `${header.offsetHeight}px`
            );
        };

        updateHeaderHeight();
        window.addEventListener("resize", updateHeaderHeight);

        return () => window.removeEventListener("resize", updateHeaderHeight);
    }, [isLiveRoute]);

    if (isLiveRoute) {
        return (
            <>
                <GlobalLoadingIndicator />
                {children}
            </>
        );
    }

    return (
        <FloatingPlayerProvider>
            <GlobalLoadingIndicator />
            <ShellContent title={title}>{children}</ShellContent>
        </FloatingPlayerProvider>
    );
}
