"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Cast, X } from "lucide-react";
import { useCurrentProgram } from "@/hooks/useCurrentProgram";
import { type Channel, type Program } from "@/lib/channels-data";
import { type DockedCastControl } from "@/context/player-context";

export type TopProgramPanel = {
    channelName: string;
    description: string;
    image: string;
    isLive: boolean;
    subtitle: string;
    timeRange: string;
    title: string;
};

type TopPlayerOverlayProps = {
    channel: Channel | null;
    isFullscreen: boolean;
    isDocked: boolean;
    castControl: DockedCastControl | null;
    onClose: () => void;
    renderPlayer: (
        className?: string,
        options?: {
            hideTopControls?: boolean;
            registerDockedCastControl?: boolean;
        },
    ) => ReactNode;
};

type TopProgramCardProps = {
    actions?: ReactNode;
    channelLogo?: string;
    className?: string;
    onClose: () => void;
    panel: TopProgramPanel;
};

const resolvePanelImage = (image?: string): string => {
    if (!image) return "";
    if (image.startsWith("http://") || image.startsWith("https://")) return image;
    if (image.startsWith("//")) return `https:${image}`;
    if (image.startsWith("/")) return image;
    return `/ch/${image}`;
};

const resolveChannelLogo = (channel: Channel): string => {
    if (channel.module === "kan-vod") {
        return "/ch/kan.jpg";
    }

    if (channel.module === "keshet-vod") {
        return "/ch/mako.png";
    }

    if (channel.module === "local-series" || (channel.type === "vod" && !channel.logo)) {
        return "/ch/vod.jpg";
    }

    return resolvePanelImage(channel.logo || "");
};

const formatTime = (ts: number): string => {
    return new Date(ts * 1000).toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
};

const formatTimeRange = (program: Program | null): string => {
    if (!program) return "";
    return `${formatTime(program.start)} - ${formatTime(program.end)}`;
};

function useCanShowTopDetails() {
    const [canShowTopDetails, setCanShowTopDetails] = useState(true);

    useEffect(() => {
        const media = window.matchMedia("(min-width: 820px)");
        const update = () => setCanShowTopDetails(media.matches);

        update();
        media.addEventListener("change", update);

        return () => media.removeEventListener("change", update);
    }, []);

    return canShowTopDetails;
}

const resolveProgramPanel = (channel: Channel, program: Program | null): TopProgramPanel => {
    const title =
        program?.name ||
        channel.vodMeta?.episodeName ||
        channel.playerSubtitle ||
        channel.playerTitle ||
        channel.name ||
        "";
    const description =
        program?.description ||
        channel.vodMeta?.episodeDescription ||
        channel.vodMeta?.programDescription ||
        "";
    const subtitle = program
        ? channel.name || ""
        : channel.vodMeta
            ? [channel.vodMeta.channelName, channel.vodMeta.seasonName].filter(Boolean).join(" · ")
            : channel.name || "";

    return {
        channelName: channel.vodMeta?.channelName || channel.name || "",
        description,
        image: resolvePanelImage(
            program?.image ||
            channel.vodMeta?.episodeImage ||
            channel.vodMeta?.programImage ||
            channel.playerLogo ||
            channel.logo
        ),
        isLive: Boolean(channel.type !== "vod" && program),
        subtitle,
        timeRange: formatTimeRange(program),
        title,
    };
};

function TopIconButton({
    active,
    children,
    disabled,
    label,
    onClick,
    title,
}: {
    active?: boolean;
    children: ReactNode;
    disabled?: boolean;
    label: string;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`top-playback__icon-button ${active ? "top-playback__icon-button--active" : ""}`}
            aria-label={label}
            title={title}
        >
            {children}
        </button>
    );
}

function CastButton({ castControl }: { castControl: DockedCastControl | null }) {
    if (!castControl) return null;

    return (
        <TopIconButton
            onClick={castControl.onCast}
            disabled={
                castControl.isConnecting ||
                !castControl.canCast ||
                (!castControl.isAvailable && !castControl.isCasting)
            }
            active={castControl.isCasting}
            label={castControl.isCasting ? "עצור Cast" : "הפעל Cast"}
            title={
                !castControl.canCast
                    ? "Cast is not ready"
                    : !castControl.isAvailable && !castControl.isCasting
                        ? "Cast device not available"
                        : castControl.isCasting
                            ? "Stop casting"
                            : "Cast"
            }
        >
            <Cast className="h-4 w-4" aria-hidden="true" />
        </TopIconButton>
    );
}

export function TopProgramCard({
    actions,
    channelLogo,
    className = "",
    onClose,
    panel,
}: TopProgramCardProps) {
    return (
        <aside dir="rtl" className={`top-program-card ${className}`}>
            {panel.image && (
                <>
                    <img src={panel.image} alt="" className="top-program-card__image-fill" loading="lazy" />
                    <img src={panel.image} alt="" className="top-program-card__image-main" loading="lazy" />
                </>
            )}
            <div className="top-program-card__scrim" />
            <div className="top-program-card__fade" />

            <div className="top-program-card__topbar">
                <div className="top-program-card__identity">
                    {channelLogo && (
                        <span className="top-program-card__logo">
                            <img src={channelLogo} alt="" loading="lazy" />
                        </span>
                    )}
                    <span className="top-program-card__channel">
                        {panel.channelName}
                    </span>
                    {(panel.timeRange || panel.subtitle || panel.isLive) && (
                        <span className="top-program-card__meta">
                            {panel.subtitle && <span>{panel.subtitle}</span>}
                            {panel.timeRange && <span dir="ltr">{panel.timeRange}</span>}
                            {panel.isLive && <span className="top-program-card__live-dot" aria-label="שידור חי" />}
                        </span>
                    )}
                </div>
                <div className="top-program-card__controls">
                    {actions}
                    <TopIconButton onClick={onClose} label="סגור">
                        <X className="h-4 w-4" aria-hidden="true" />
                    </TopIconButton>
                </div>
            </div>

            <div className="top-program-card__content">
                <h2>{panel.title}</h2>
                {panel.description && (
                    <p>{panel.description}</p>
                )}
            </div>
        </aside>
    );
}

function PlayerOnlyControls({
    castControl,
    onClose,
}: {
    castControl: DockedCastControl | null;
    onClose: () => void;
}) {
    return (
        <div className="top-playback__player-controls" dir="rtl">
            <TopIconButton onClick={onClose} label="סגור נגן">
                <X className="h-4 w-4" aria-hidden="true" />
            </TopIconButton>
            <CastButton castControl={castControl} />
        </div>
    );
}

export function TopPlayerOverlay({
    castControl,
    channel,
    isDocked,
    isFullscreen,
    onClose,
    renderPlayer,
}: TopPlayerOverlayProps) {
    const currentProgram = useCurrentProgram(channel?.programs);
    const canShowTopDetails = useCanShowTopDetails();

    if (!channel || (!isFullscreen && isDocked)) {
        return null;
    }

    if (isFullscreen) {
        return (
            <div dir="rtl" className="player-overlay-fullscreen">
                {renderPlayer("h-full w-full")}
            </div>
        );
    }

    const panel = resolveProgramPanel(channel, currentProgram);
    const hasDetails = Boolean(panel.title || panel.description);
    const shouldShowDetails = hasDetails && canShowTopDetails;

    return (
        <div
            dir="ltr"
            className={`top-playback ${shouldShowDetails ? "top-playback--with-details" : "top-playback--player-only"}`}
        >
            {shouldShowDetails && (
                <TopProgramCard
                    actions={<CastButton castControl={castControl} />}
                    channelLogo={resolveChannelLogo(channel)}
                    onClose={onClose}
                    panel={panel}
                />
            )}
            <div className="top-playback__player">
                {!hasDetails && (
                    <PlayerOnlyControls
                        castControl={castControl}
                        onClose={onClose}
                    />
                )}
                {renderPlayer("h-full w-full top-playback__video-root", {
                    hideTopControls: shouldShowDetails,
                    registerDockedCastControl: shouldShowDetails,
                })}
            </div>
        </div>
    );
}
