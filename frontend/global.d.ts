// global.d.ts
declare module "*.css";

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void
    cast?: any
    chrome?: any
  }

  namespace cast.framework {
    enum CastContextEventType {
      CAST_STATE_CHANGED = "caststatechanged",
      SESSION_STATE_CHANGED = "sessionstatechanged",
    }

    enum CastState {
      NO_DEVICES_AVAILABLE = "NO_DEVICES_AVAILABLE",
      NOT_CONNECTED = "NOT_CONNECTED",
      CONNECTING = "CONNECTING",
      CONNECTED = "CONNECTED",
    }

    enum SessionState {
      SESSION_STARTING = "SESSION_STARTING",
      SESSION_STARTED = "SESSION_STARTED",
      SESSION_START_FAILED = "SESSION_START_FAILED",
      SESSION_ENDING = "SESSION_ENDING",
      SESSION_ENDED = "SESSION_ENDED",
      SESSION_RESUMED = "SESSION_RESUMED",
    }

    interface CastStateEventData {
      castState: CastState
    }

    interface SessionStateEventData {
      sessionState: SessionState
    }

    class CastContext {
      static getInstance(): CastContext
      setOptions(options: {
        receiverApplicationId: string
        autoJoinPolicy: chrome.cast.AutoJoinPolicy
        resumeSavedSession?: boolean
      }): void
      getCastState(): CastState
      getCurrentSession(): CastSession | null
      requestSession(): Promise<void>
      addEventListener(
        type: CastContextEventType,
        listener: (event: any) => void
      ): void
      removeEventListener(
        type: CastContextEventType,
        listener: (event: any) => void
      ): void
    }

    class CastSession {
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>
      endSession(stopCasting: boolean): Promise<void>
      getMediaSession(): chrome.cast.media.Media | null
      setReceiverMuted(muted: boolean): Promise<void>
      setReceiverVolumeLevel(volume: number): Promise<void>
    }

    class RemotePlayer {}
    class RemotePlayerController {
      constructor(player: RemotePlayer)
    }
  }

  namespace chrome.cast {
    enum AutoJoinPolicy {
      ORIGIN_SCOPED = "origin_scoped",
    }

    class Image {
      constructor(url: string)
      url: string
    }

    namespace media {
      enum StreamType {
        LIVE = "LIVE",
      }

      class MediaInfo {
        constructor(contentId: string, contentType: string)
        streamType: StreamType
        metadata?: GenericMediaMetadata
        duration?: number
      }

      class GenericMediaMetadata {
        title?: string
        subtitle?: string
        images?: Image[]
      }

      class LoadRequest {
        constructor(mediaInfo: MediaInfo)
        autoplay?: boolean
        currentTime?: number
      }

      class Media {
        media?: MediaInfo
        addUpdateListener(listener: () => void): void
        removeUpdateListener(listener: () => void): void
      }
    }
  }
}

export {}
