"use client";

import { type ReactNode, type Ref } from "react";
import { Clapperboard, Play, Search, ChevronLeft } from "lucide-react";

export type VodDetailMetaItem = {
  key: string;
  content: ReactNode;
};

export type VodDetailAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  iconOnlyInFloating?: boolean;
};

export type VodSeasonTab = {
  id: string;
  title: string;
  count: number;
};

export type VodCastMember = {
  id: string;
  name: string;
  character?: string | null;
  profile?: string | null;
};

export type VodEpisodeCardItem = {
  id: string;
  image?: string | null;
  title: string;
  meta?: string;
  description?: string | null;
  fallbackText?: string;
  runtime?: string | null;
  badges?: string[];
  isPlaying?: boolean;
};

type SharedHeaderProps = {
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  metaItems: VodDetailMetaItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  seasons: VodSeasonTab[];
  activeSeason: string | null;
  onSeasonChange: (season: string) => void;
};

type VodSeasonTabsProps = {
  seasons: VodSeasonTab[];
  activeSeason: string | null;
  onSeasonChange: (season: string) => void;
};

function VodPoster({
  poster,
  className,
  iconClassName,
}: {
  poster?: string | null;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-lg border border-border bg-background ${className}`}>
      {poster ? (
        <img src={poster} alt="" className="aspect-[2/3] h-full w-full object-cover" />
      ) : (
        <div className="flex aspect-[2/3] items-center justify-center">
          <Clapperboard className={iconClassName} />
        </div>
      )}
    </div>
  );
}

function VodSearchBox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="חיפוש פרקים"
        className="w-full rounded-lg border border-border bg-background/80 py-2 pr-9 pl-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export function VodSeasonTabs({
  seasons,
  activeSeason,
  onSeasonChange,
}: VodSeasonTabsProps) {
  if (seasons.length === 0) return null;

  return (
    <div className="relative z-10 border-t border-border/70 bg-card/80 px-1.5 py-1.5 sm:px-3 sm:py-2">
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide sm:gap-1.5 sm:pb-1" role="tablist" aria-label="עונות">
        {seasons.map((season) => {
          const isActive = season.id === activeSeason;
          return (
            <button
              key={season.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSeasonChange(season.id)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-primary sm:px-3 sm:py-1.5 sm:text-xs ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:bg-secondary hover:text-foreground"
              }`}
            >
              {season.title} · {season.count}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VodSeriesFloatingHeader({
  show,
  title,
  poster,
  backdrop,
  metaItems,
  actions,
  searchQuery,
  onSearchChange,
  seasons,
  activeSeason,
  onSeasonChange,
}: SharedHeaderProps & {
  show: boolean;
  actions: VodDetailAction[];
}) {
  return (
    <div className={`fixed left-3 right-3 top-[var(--site-header-height,0px)] z-40 bg-background pb-2 pt-1.5 transition-[opacity,transform] duration-300 sm:left-4 sm:right-4 sm:pt-3 ${
      show
        ? "translate-y-0 opacity-100 ease-out"
        : "pointer-events-none -translate-y-3 opacity-0 ease-in"
    }`}>
      <div className={`overflow-hidden rounded-lg border border-border bg-card transition-[box-shadow,transform] duration-300 ${
        show ? "translate-y-0 shadow-lg shadow-black/15" : "-translate-y-1 shadow-none"
      }`}>
        <div className="relative min-h-[4.5rem] overflow-hidden sm:min-h-28">
          {backdrop ? (
            <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
          ) : null}
          <div className="absolute inset-0 bg-linear-to-t from-card via-card/80 to-card/30" />

          <div className="relative z-10 flex flex-row items-center gap-3 p-2 sm:p-3 md:items-start">
            <VodPoster poster={poster} className="w-10 sm:w-16" iconClassName="h-8 w-8 text-muted-foreground" />

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 hidden items-center gap-2 sm:flex">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    title={action.title}
                    className={action.iconOnlyInFloating
                      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/70 transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
                      : "inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
                    }
                  >
                    {action.icon}
                    {!action.iconOnlyInFloating ? action.label : null}
                  </button>
                ))}
              </div>

              <h1 className="line-clamp-1 text-base font-bold text-foreground sm:text-xl">
                {title}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:mt-1.5 sm:gap-2 sm:text-sm">
                {metaItems.map((item) => (
                  <span key={item.key}>{item.content}</span>
                ))}
              </div>
            </div>

            <VodSearchBox value={searchQuery} onChange={onSearchChange} className="hidden w-full md:block md:w-80" />
          </div>

          <VodSeasonTabs seasons={seasons} activeSeason={activeSeason} onSeasonChange={onSeasonChange} />
        </div>
      </div>
    </div>
  );
}

export function VodSeriesHeroCard({
  cardRef,
  hidden,
  title,
  poster,
  backdrop,
  metaItems,
  tags,
  cast,
  description,
  actions,
  searchQuery,
  onSearchChange,
  seasons,
  activeSeason,
  onSeasonChange,
}: SharedHeaderProps & {
  cardRef: Ref<HTMLDivElement>;
  hidden: boolean;
  tags?: string[];
  cast?: VodCastMember[];
  description?: string | null;
  actions: VodDetailAction[];
}) {
  return (
    <div
      ref={cardRef}
      className={`mb-3 overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 ${
        hidden ? "pointer-events-none -translate-y-2 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="relative min-h-[11rem] overflow-hidden sm:min-h-52 lg:min-h-64">
        {backdrop ? (
          <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/80 to-card/30" />

        <div className="relative z-10 flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-start">
          <VodPoster poster={poster} className="w-20 sm:w-28" iconClassName="h-8 w-8 text-muted-foreground" />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            <h1 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {metaItems.map((item) => (
                <span key={item.key}>{item.content}</span>
              ))}
            </div>

            {tags && tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {cast && cast.length > 0 ? (
              <div className="mt-2 hidden sm:block">
                <p className="mb-1 text-xs font-medium text-foreground">שחקנים</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {cast.slice(0, 8).map((person) => (
                    <div key={person.id || person.name} className="w-14 shrink-0 text-center sm:w-16">
                      <div className="mx-auto h-10 w-10 overflow-hidden rounded-full border border-border bg-muted">
                        {person.profile ? (
                          <img src={person.profile} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                            {person.name?.slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11px] font-medium text-foreground">{person.name}</p>
                      {person.character ? (
                        <p className="line-clamp-1 text-[10px] text-muted-foreground">{person.character}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {description ? (
              <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>

          <VodSearchBox value={searchQuery} onChange={onSearchChange} className="w-full md:w-80" />
        </div>

        <VodSeasonTabs seasons={seasons} activeSeason={activeSeason} onSeasonChange={onSeasonChange} />
      </div>
    </div>
  );
}

export function VodEpisodeGrid({
  episodes,
  onPlay,
}: {
  episodes: VodEpisodeCardItem[];
  onPlay: (episode: VodEpisodeCardItem) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {episodes.map((episode) => (
        <button
          key={episode.id}
          type="button"
          onClick={() => onPlay(episode)}
          className={`group flex h-full min-h-[20rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary ${
            episode.isPlaying
              ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)),0_0_22px_rgba(45,212,191,0.22)]"
              : ""
          }`}
          aria-current={episode.isPlaying ? "true" : undefined}
        >
          <div className="relative aspect-video overflow-hidden bg-background">
            {episode.image ? (
              <img
                src={episode.image}
                alt=""
                className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Clapperboard className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/15 to-transparent" />
            <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
              <Play className="h-3.5 w-3.5" />
              נגן
            </div>
            {episode.runtime ? (
              <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                {episode.runtime}
              </div>
            ) : null}
            {episode.isPlaying ? (
              <div className="absolute left-2 bottom-2 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-md">
                מתנגן
              </div>
            ) : null}
          </div>

          <div className="min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {episode.meta ? <p className="text-xs text-muted-foreground">{episode.meta}</p> : null}
                <h3 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">
                  {episode.title}
                </h3>
              </div>
              <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
            </div>

            {episode.description ? (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {episode.description}
              </p>
            ) : episode.fallbackText ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {episode.fallbackText}
              </p>
            ) : null}

            {episode.badges && episode.badges.length > 0 ? (
              <div className="mt-3 hidden flex-wrap gap-1.5 text-xs text-muted-foreground sm:flex">
                {episode.badges.map((badge) => (
                  <span key={badge} className="rounded-full bg-muted px-2 py-1">{badge}</span>
                ))}
              </div>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}
