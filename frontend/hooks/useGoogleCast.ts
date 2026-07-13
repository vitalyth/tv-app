"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { type Channel } from "@/lib/channels-data"
import { getVodProgress, saveVodProgress, shouldResumeVodProgress } from "@/lib/vod-progress"

const CAST_SDK_SRC = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
const DEFAULT_RECEIVER_APP_ID = "CC1AD845"
const HLS_MEDIA_PLAYLIST_PATH = /\/chunklist(?:_[^/]*)?\.m3u8$/
const CAST_SESSION_STORAGE_KEY = "cast_active_channel_id"
const VOD_PROGRESS_SAVE_INTERVAL_MS = 5000

export const saveCastChannelId = (channelId: string) => {
    if (typeof window === "undefined") return
    sessionStorage.setItem(CAST_SESSION_STORAGE_KEY, channelId)
}

export const clearCastChannelId = () => {
    if (typeof window === "undefined") return
    sessionStorage.removeItem(CAST_SESSION_STORAGE_KEY)
}

export const getPersistedCastChannelId = (): string | null => {
    if (typeof window === "undefined") return null
    return sessionStorage.getItem(CAST_SESSION_STORAGE_KEY)
}

type CastSessionState = "disconnected" | "connecting" | "connected"

interface UseGoogleCastOptions {
    channel: Channel | null
    streamUrl: string | null
    programName?: string
    onCastStarted?: () => void
    onCastEnded?: () => void
}

interface CastLoadOptions {
    channel: Channel
    streamUrl: string
    programName?: string
}

const getCast = () => {
    if (typeof window === "undefined") return null
    return window.cast || null
}

const getChromeCast = () => {
    if (typeof window === "undefined") return null
    return window.chrome?.cast || null
}

const resolveAbsoluteUrl = (url: string) => {
    if (typeof window === "undefined") return url
    return new URL(url, window.location.origin).toString()
}

const resolveCastApiUrl = (path: string) => {
    const castApiBaseUrl =
        process.env.NEXT_PUBLIC_CAST_API_BASE ||
        process.env.NEXT_PUBLIC_CAST_API_BASE_URL

    if (castApiBaseUrl) {
        return `${castApiBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
    }

    return resolveAbsoluteUrl(api(path))
}

const buildCastImageUrl = (logo: string) => {
    if (logo.startsWith("http://") || logo.startsWith("https://")) {
        return logo
    }

    const assetBaseUrl = process.env.NEXT_PUBLIC_CAST_ASSET_BASE_URL

    if (assetBaseUrl) {
        return new URL(`/ch/${logo}`, assetBaseUrl).toString()
    }

    return resolveAbsoluteUrl(`/ch/${logo}`)
}

const shouldUseVpnProxy = (channel: Channel) => {
    const channelId = channel.channelID || channel.id || ""
    return channel.linkDetails?.vpn || channel.module === "kan-vod" || channelId.startsWith("ch_11")
}

const getCastSourceUrl = (streamUrl: string) => {
    try {
        const parsedUrl = new URL(streamUrl)

        if (
            parsedUrl.hostname.endsWith("brightcove.com") &&
            parsedUrl.pathname.endsWith("/playlist-hls.m3u8")
        ) {
            parsedUrl.pathname = parsedUrl.pathname.replace(/\/playlist-hls\.m3u8$/, "/playlist-dash.mpd")
            return parsedUrl.toString()
        }

        if (HLS_MEDIA_PLAYLIST_PATH.test(parsedUrl.pathname)) {
            parsedUrl.pathname = parsedUrl.pathname.replace(HLS_MEDIA_PLAYLIST_PATH, "/playlist-hls.m3u8")
            return parsedUrl.toString()
        }
    } catch {
        return streamUrl
    }

    return streamUrl
}

const isBrightcoveStream = (streamUrl: string) => {
    try {
        return new URL(streamUrl).hostname.endsWith("brightcove.com")
    } catch {
        return false
    }
}

const isFmp4HlsStream = (streamUrl: string, channel?: Channel) => {
    if (channel?.module === "kan-vod") {
        return true
    }

    try {
        const parsedUrl = new URL(streamUrl)
        return (
            parsedUrl.pathname.toLowerCase().includes("/manifest.ism/") ||
            parsedUrl.search.toLowerCase().includes("fmp4")
        )
    } catch {
        const lowerStreamUrl = streamUrl.toLowerCase()
        return lowerStreamUrl.includes("/manifest.ism/") || lowerStreamUrl.includes("fmp4")
    }
}

const isDashStream = (streamUrl: string, channel?: Channel) => {
    if (channel?.linkDetails?.manifest_type === "mpd") {
        return true
    }

    try {
        const pathname = new URL(streamUrl).pathname
        return pathname.endsWith(".mpd") || pathname.includes("/livedash/")
    } catch {
        return streamUrl.includes("/livedash/") || streamUrl.endsWith(".mpd")
    }
}

const isLocalSeriesStream = (streamUrl: string) => {
    return streamUrl.includes("/stream/local-series")
}

const isLocalSeriesHlsStream = (streamUrl: string, channel?: Channel) => {
    return (
        isLocalSeriesStream(streamUrl) &&
        (
            streamUrl.toLowerCase().includes(".m3u8") ||
            channel?.linkDetails?.manifest_type === "hls"
        )
    )
}

const getCastContentType = (castSourceUrl: string, channel: Channel) => {
    if (isLocalSeriesHlsStream(castSourceUrl, channel)) {
        return "application/x-mpegURL"
    }

    if (isLocalSeriesStream(castSourceUrl) || castSourceUrl.endsWith(".mp4")) {
        return "video/mp4"
    }

    return isDashStream(castSourceUrl, channel)
        ? "application/dash+xml"
        : "application/x-mpegURL"
}

const buildCastStreamUrl = (castSourceUrl: string, castContentType: string, channel: Channel, referer = "") => {
    console.log("Original stream URL:", castSourceUrl)

    if (isLocalSeriesStream(castSourceUrl) && castContentType !== "application/x-mpegURL") {
        return resolveAbsoluteUrl(castSourceUrl)
    }

    const useVpnProxy = shouldUseVpnProxy(channel)
    const proxyEndpoint = useVpnProxy ? "/v/proxy" : "/proxy"
    const vpnParam = useVpnProxy ? "&vpn=true" : ""
    const proxyPath = `${proxyEndpoint}?url=${encodeURIComponent(castSourceUrl)}&referer=${encodeURIComponent(referer)}&cast=1${vpnParam}`

    return resolveCastApiUrl(proxyPath)
}

const hasDvrWindow = (media?: chrome.cast.media.Media | null) => {
    const duration = media?.media?.duration
    return typeof duration === "number" && Number.isFinite(duration) && duration > 0
}

const ensureCastSenderScript = () => {
    if (typeof window === "undefined") return Promise.resolve(false)

    if (getCast()?.framework && getChromeCast()) {
        return Promise.resolve(true)
    }

    return new Promise<boolean>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${CAST_SDK_SRC}"]`)

        const previousCallback = window.__onGCastApiAvailable
        window.__onGCastApiAvailable = (isAvailable: boolean) => {
            previousCallback?.(isAvailable)
            resolve(isAvailable)
        }

        if (existing) return

        const script = document.createElement("script")
        script.src = CAST_SDK_SRC
        script.async = true
        script.onerror = () => resolve(false)
        document.head.appendChild(script)
    })
}

export function useGoogleCast({
    channel,
    streamUrl,
    programName,
    onCastStarted,
    onCastEnded,
}: UseGoogleCastOptions) {
    const [isAvailable, setIsAvailable] = useState(false)
    const [sessionState, setSessionState] = useState<CastSessionState>("disconnected")
    const [hasDvr, setHasDvr] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [deviceName, setDeviceName] = useState<string | null>(null)
    const lastLoadKeyRef = useRef<string | null>(null)
    const loadSequenceRef = useRef(0)
    const remotePlayerRef = useRef<cast.framework.RemotePlayer | null>(null)
    const remoteControllerRef = useRef<cast.framework.RemotePlayerController | null>(null)
    const mediaStatusUnsubscribeRef = useRef<(() => void) | null>(null)
    const lastVodProgressSaveRef = useRef(0)
    const desiredLoadRef = useRef<(CastLoadOptions & { loadKey: string }) | null>(null)
    const isDrainingLoadQueueRef = useRef(false)
    const channelRef = useRef(channel)
    const streamUrlRef = useRef(streamUrl)
    const programNameRef = useRef(programName)
    const onCastStartedRef = useRef(onCastStarted)
    const onCastEndedRef = useRef(onCastEnded)

    useEffect(() => {
        channelRef.current = channel
        streamUrlRef.current = streamUrl
        programNameRef.current = programName
        onCastStartedRef.current = onCastStarted
        onCastEndedRef.current = onCastEnded
    }, [channel, onCastEnded, onCastStarted, programName, streamUrl])

    const clearMediaStatusListener = useCallback(() => {
        mediaStatusUnsubscribeRef.current?.()
        mediaStatusUnsubscribeRef.current = null
    }, [])

    const loadCastMediaNow = useCallback(async ({ channel, streamUrl, programName }: CastLoadOptions) => {
        const castApi = getCast()
        const chromeCast = getChromeCast()
        const session = castApi?.framework.CastContext.getInstance().getCurrentSession()

        if (!castApi || !chromeCast || !session) return false

        const loadKey = `${channel.id}:${streamUrl}`
        if (lastLoadKeyRef.current === loadKey) return true

        const loadSequence = loadSequenceRef.current + 1
        loadSequenceRef.current = loadSequence

        const castSourceUrl = getCastSourceUrl(streamUrl)
        const castContentType = getCastContentType(castSourceUrl, channel)

        const mediaInfo = new chromeCast.media.MediaInfo(
            buildCastStreamUrl(castSourceUrl, castContentType, channel, channel.linkDetails?.referer),
            castContentType
        )

        if (castContentType === "application/x-mpegURL") {
            const hlsSegmentFormat = (chromeCast.media as any).HlsSegmentFormat?.FMP4
            const hlsVideoSegmentFormat = (chromeCast.media as any).HlsVideoSegmentFormat?.FMP4
            const tsSegmentFormat = (chromeCast.media as any).HlsSegmentFormat?.TS
            const tsVideoSegmentFormat = (chromeCast.media as any).HlsVideoSegmentFormat?.MPEG2_TS

            if ((isBrightcoveStream(streamUrl) || isFmp4HlsStream(streamUrl, channel)) && hlsSegmentFormat && hlsVideoSegmentFormat) {
                mediaInfo.hlsSegmentFormat = hlsSegmentFormat
                mediaInfo.hlsVideoSegmentFormat = hlsVideoSegmentFormat
            } else if (tsSegmentFormat && tsVideoSegmentFormat) {
                mediaInfo.hlsSegmentFormat = tsSegmentFormat
                mediaInfo.hlsVideoSegmentFormat = tsVideoSegmentFormat
            }
        }

        const imageUrl = buildCastImageUrl(channel.logo)

        mediaInfo.streamType = channel.type === "vod"
            ? chromeCast.media.StreamType.BUFFERED
            : chromeCast.media.StreamType.LIVE
        mediaInfo.customData = {
            posterUrl: imageUrl,
            thumb: imageUrl,
            thumbnail: imageUrl,
            imageUrl,
        }
        mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata()
        mediaInfo.metadata.title = channel.name
        mediaInfo.metadata.subtitle = programName
        mediaInfo.metadata.images = [
            new chromeCast.Image(imageUrl),
            { url: imageUrl },
        ] as chrome.cast.Image[]
        mediaInfo.metadata.releaseDate = new Date().toISOString()

        const request = new chromeCast.media.LoadRequest(mediaInfo)
        request.autoplay = true
        request.customData = mediaInfo.customData

        if (channel.type === "vod") {
            const savedProgress = getVodProgress(channel.id)
            const resumeTime = savedProgress?.currentTime ?? 0
            const duration = savedProgress?.duration ?? 0

            if (shouldResumeVodProgress(resumeTime, duration)) {
                ;(request as any).currentTime = resumeTime
            }
        }

        try {
            await session.loadMedia(request)

            if (loadSequenceRef.current !== loadSequence) {
                return true
            }

            clearMediaStatusListener()
            lastLoadKeyRef.current = loadKey
            saveCastChannelId(channel.id)

            const media = session.getMediaSession()
            setHasDvr(hasDvrWindow(media))
            lastVodProgressSaveRef.current = 0

            const saveCastVodProgress = (force = false) => {
                if (channel.type !== "vod") return

                const currentMedia = session.getMediaSession()
                if (!currentMedia) return

                const now = Date.now()
                if (!force && now - lastVodProgressSaveRef.current < VOD_PROGRESS_SAVE_INTERVAL_MS) return

                const currentTime = currentMedia.getEstimatedTime?.() ?? 0
                const duration = currentMedia.media?.duration ?? 0
                saveVodProgress(channel.id, currentTime, duration)
                lastVodProgressSaveRef.current = now
            }

            const statusHandler = () => {
                const currentMedia = session.getMediaSession()
                setHasDvr(hasDvrWindow(currentMedia))
                saveCastVodProgress()
            }

            media?.addUpdateListener(statusHandler)
            mediaStatusUnsubscribeRef.current = () => {
                saveCastVodProgress(true)
                media?.removeUpdateListener(statusHandler)
            }
            setError(null)
            return true
        } catch (err) {
            if (loadSequenceRef.current === loadSequence) {
                console.error("Failed to load Cast media:", err)
                setError("cast-load-failed")
            } else {
                console.debug("Ignored stale Cast media load failure:", err)
            }
            return false
        }
    }, [clearMediaStatusListener])

    const drainLoadQueue = useCallback(async () => {
        if (isDrainingLoadQueueRef.current) return

        isDrainingLoadQueueRef.current = true

        try {
            while (desiredLoadRef.current) {
                const target = desiredLoadRef.current

                if (lastLoadKeyRef.current === target.loadKey) {
                    desiredLoadRef.current = null
                    continue
                }

                const loaded = await loadCastMediaNow(target)
                const targetStillDesired = desiredLoadRef.current?.loadKey === target.loadKey

                if (targetStillDesired) {
                    desiredLoadRef.current = null
                }

                if (!loaded && targetStillDesired) {
                    break
                }
            }
        } finally {
            isDrainingLoadQueueRef.current = false
        }
    }, [loadCastMediaNow])

    const queueCastMediaLoad = useCallback((options: CastLoadOptions) => {
        desiredLoadRef.current = {
            ...options,
            loadKey: `${options.channel.id}:${options.streamUrl}`,
        }

        void drainLoadQueue()
    }, [drainLoadQueue])

    const loadCurrentMedia = useCallback(() => {
        const currentChannel = channelRef.current
        const currentStreamUrl = streamUrlRef.current

        if (!currentChannel || !currentStreamUrl) return

        queueCastMediaLoad({
            channel: currentChannel,
            streamUrl: currentStreamUrl,
            programName: programNameRef.current,
        })
    }, [queueCastMediaLoad])

    const requestCastSession = useCallback(async () => {
        const castApi = getCast()
        if (!castApi?.framework || !channelRef.current || !streamUrlRef.current) return

        setError(null)
        setSessionState("connecting")

        try {
            await castApi.framework.CastContext.getInstance().requestSession()
            loadCurrentMedia()
        } catch (err) {
            console.warn("Cast session request failed:", err)
            setError("cast-session-failed")
            setSessionState("disconnected")
        }
    }, [loadCurrentMedia])

    const stopCasting = useCallback(async () => {
        const session = getCast()?.framework.CastContext.getInstance().getCurrentSession()

        // Optimistic UI update:
        // Do not wait for the Cast SDK session-ended event.
        // This immediately returns the local UI from the Cast screen back to the player.
        setSessionState("disconnected")
        setHasDvr(false)
        loadSequenceRef.current += 1
        lastLoadKeyRef.current = null
        desiredLoadRef.current = null
        clearMediaStatusListener()
        clearCastChannelId()
        onCastEndedRef.current?.()

        try {
            await session?.endSession(true)
        } catch (err) {
            console.warn("Failed to stop Cast session:", err)
            setSessionState("connected")
            setError("cast-stop-failed")
        }
    }, [clearMediaStatusListener])

    const setVolume = useCallback(async (volume: number, muted: boolean) => {
        const session = getCast()?.framework.CastContext.getInstance().getCurrentSession()
        if (!session) return

        try {
            await session.setReceiverMuted(muted)
            await session.setReceiverVolumeLevel(Math.min(1, Math.max(0, volume)))
        } catch (err) {
            console.warn("Failed to update Cast volume:", err)
        }
    }, [])

    useEffect(() => {
        let isMounted = true
        let sessionStateListener: ((event: cast.framework.SessionStateEventData) => void) | null = null
        let castStateListener: ((event: cast.framework.CastStateEventData) => void) | null = null

        ensureCastSenderScript().then((ready) => {
            if (!isMounted || !ready) return

            const castApi = getCast()
            const chromeCast = getChromeCast()
            if (!castApi?.framework || !chromeCast) return

            const context = castApi.framework.CastContext.getInstance()
            context.setOptions({
                receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
                autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
                resumeSavedSession: false,
            })

            const updateCastAvailability = () => {
                const castState = context.getCastState()
                setIsAvailable(
                    castState === castApi.framework.CastState.NOT_CONNECTED ||
                    castState === castApi.framework.CastState.CONNECTING ||
                    castState === castApi.framework.CastState.CONNECTED
                )
            }

            castStateListener = () => updateCastAvailability()
            sessionStateListener = (event) => {
                if (
                    event.sessionState === castApi.framework.SessionState.SESSION_STARTED ||
                    event.sessionState === castApi.framework.SessionState.SESSION_RESUMED
                ) {
                    setSessionState("connected")
                    const session = castApi.framework.CastContext.getInstance().getCurrentSession()
                    const name = session?.getCastDevice?.()?.friendlyName ?? null
                    setDeviceName(name)
                    if (channelRef.current?.id) saveCastChannelId(channelRef.current.id)
                    onCastStartedRef.current?.()
                    loadCurrentMedia()
                    return
                }

                if (event.sessionState === castApi.framework.SessionState.SESSION_STARTING) {
                    setSessionState("connecting")
                    return
                }

                if (
                    event.sessionState === castApi.framework.SessionState.SESSION_ENDED ||
                    event.sessionState === castApi.framework.SessionState.SESSION_START_FAILED
                ) {
                    setSessionState("disconnected")
                    setHasDvr(false)
                    setDeviceName(null)
                    loadSequenceRef.current += 1
                    lastLoadKeyRef.current = null
                    desiredLoadRef.current = null
                    clearMediaStatusListener()
                    clearCastChannelId()
                    onCastEndedRef.current?.()
                }
            }

            context.addEventListener(castApi.framework.CastContextEventType.CAST_STATE_CHANGED, castStateListener)
            context.addEventListener(castApi.framework.CastContextEventType.SESSION_STATE_CHANGED, sessionStateListener)
            remotePlayerRef.current = new castApi.framework.RemotePlayer()
            remoteControllerRef.current = new castApi.framework.RemotePlayerController(remotePlayerRef.current)
            updateCastAvailability()
        })

        return () => {
            isMounted = false
            const castApi = getCast()
            const context = castApi?.framework?.CastContext.getInstance()

            if (context && castApi?.framework) {
                if (castStateListener) {
                    context.removeEventListener(castApi.framework.CastContextEventType.CAST_STATE_CHANGED, castStateListener)
                }
                if (sessionStateListener) {
                    context.removeEventListener(castApi.framework.CastContextEventType.SESSION_STATE_CHANGED, sessionStateListener)
                }
            }

            clearMediaStatusListener()
        }
    }, [clearMediaStatusListener, loadCurrentMedia])

    useEffect(() => {
        if (sessionState !== "connected" || !channel || !streamUrl) return

        const loadKey = `${channel.id}:${streamUrl}`
        if (lastLoadKeyRef.current === loadKey) return

        queueCastMediaLoad({ channel, streamUrl, programName })
    }, [channel, programName, queueCastMediaLoad, sessionState, streamUrl])

    return {
        deviceName,
        error,
        hasDvr,
        isAvailable,
        isCasting: sessionState === "connected",
        isConnecting: sessionState === "connecting",
        requestCastSession,
        setVolume,
        stopCasting,
    }
}
