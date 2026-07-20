"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { ChevronDown, ChevronLeft, Clapperboard, Play, RefreshCw, Search, Tv, X } from "lucide-react";

import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageMain } from "@/components/page-main";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type VodProviderSeries,
  type VodProviderSeriesResponse,
  type VodProviderService,
} from "@/lib/services/vod-provider-service";

const PAGE_SIZE = 48;

const getEpisodeCountText = (count: number) => {
  if (count === 0) return "טרם נסרק";
  if (count === 1) return "פרק אחד";
  return `${count} פרקים`;
};

const getSeriesImage = (series: VodProviderSeries) => series.image || "/ch/vod.jpg";

export function VodProviderListPage({
  title,
  providerPath,
  searchPlaceholder,
  service,
}: {
  title: string;
  providerPath: string;
  searchPlaceholder: string;
  service: VodProviderService;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);

  const {
    data: pages,
    isLoading,
    isValidating,
    error,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<VodProviderSeriesResponse>((pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.hasMore) return null;

    return {
      providerPath,
      query: searchQuery,
      category: selectedCategories,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    };
  }, ({ providerPath: _providerPath, ...params }) => service.getSeries(params), {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const visibleSeries = useMemo(() => pages?.flatMap((page) => page.series || []) || [], [pages]);
  const categories = useMemo(
    () => pages?.find((page) => page.categories?.length)?.categories || [],
    [pages]
  );
  const lastPage = pages?.[pages.length - 1];
  const hasMore = Boolean(lastPage?.hasMore);
  const isLoadingMore = Boolean(
    isValidating && pages && pages.length > 0 && pages[pages.length - 1]?.offset === (size - 1) * PAGE_SIZE
  );

  useEffect(() => {
    if (categories.length > 0) setAvailableCategories(categories);
  }, [categories]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    setSize(1);
  }, [searchQuery, selectedCategories, setSize]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSize((currentSize) => currentSize + 1);
      },
      { rootMargin: "320px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, setSize, visibleSeries.length]);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLocaleLowerCase("he");
    if (!normalizedSearch) return availableCategories;
    return availableCategories.filter((category) => category.toLocaleLowerCase("he").includes(normalizedSearch));
  }, [availableCategories, categorySearch]);

  const categoryLabel = useMemo(() => {
    if (selectedCategories.length === 0) return "כל הקטגוריות";
    if (selectedCategories.length === 1) return selectedCategories[0];
    return `${selectedCategories.length} קטגוריות`;
  }, [selectedCategories]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await setSize(1);
      await mutate(
        async () => [
          await service.getSeries({
            refresh: true,
            query: searchQuery,
            category: selectedCategories,
            limit: PAGE_SIZE,
            offset: 0,
          }),
        ],
        { revalidate: false }
      );
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 250);
    }
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => (
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    ));
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" dir="rtl">
      <div className="mb-2 shrink-0 border-b border-border bg-background px-2 pb-1.5 pt-1.5 sm:mb-5 sm:px-4 sm:pb-4 sm:pt-5">
        <div className="flex flex-col gap-1.5 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-2 sm:gap-3">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card sm:flex sm:h-12 sm:w-12">
              <Tv className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-6 text-foreground sm:text-2xl">{title}</h1>
              <div className="mt-0.5 hidden flex-wrap items-center gap-1 text-xs text-muted-foreground sm:mt-1 sm:flex sm:text-sm">
                <button
                  type="button"
                  onClick={() => router.push("/vod")}
                  className="rounded px-1 transition-colors hover:bg-secondary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  VOD
                </button>
                <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
                <span className="rounded bg-secondary px-1 font-medium text-foreground">{title}</span>
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-[minmax(6.25rem,0.8fr)_minmax(0,1.2fr)_2.5rem] gap-1.5 sm:flex sm:w-auto sm:flex-row sm:gap-2 lg:justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 min-w-0 items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:h-[42px] sm:w-56 sm:shrink-0 sm:gap-2 sm:px-3"
                  aria-label="סינון לפי קטגוריות"
                >
                  <span className="min-w-0 truncate text-right">{categoryLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="flex max-h-[min(70vh,34rem)] w-[calc(100vw-1rem)] max-w-[24rem] flex-col p-2 sm:w-80"
                dir="rtl"
              >
                <div className="sticky top-0 z-10 mb-2 bg-popover pb-2">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="text-sm font-medium text-foreground">סינון קטגוריות</span>
                    <span className="text-xs text-muted-foreground">{selectedCategories.length || "כל"}</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      placeholder="חיפוש קטגוריה"
                      className="h-12 w-full rounded-lg border border-border bg-background pr-10 pl-3 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-10 sm:text-sm"
                    />
                  </div>
                </div>
                {selectedCategories.length > 0 ? (
                  <div className="mb-2 shrink-0 rounded-lg border border-border bg-background/60 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">נבחרו</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:h-7"
                      >
                        <X className="h-3.5 w-3.5" />
                        נקה
                      </button>
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                      {selectedCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary"
                          title={`הסר ${category}`}
                        >
                          <X className="h-3 w-3 shrink-0" />
                          <span className="truncate">{category}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((category, index) => {
                      const checked = selectedCategories.includes(category);
                      const categoryId = `${providerPath}-category-${index}`;
                      return (
                        <div
                          key={category}
                          className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-right text-base transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:min-h-10 sm:gap-2 sm:text-sm"
                        >
                          <Checkbox
                            id={categoryId}
                            checked={checked}
                            onCheckedChange={() => toggleCategory(category)}
                            className="size-5 sm:size-4"
                          />
                          <label htmlFor={categoryId} className="min-w-0 flex-1 cursor-pointer truncate">
                            {category}
                          </label>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">לא נמצאו קטגוריות</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <DebouncedSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={searchPlaceholder}
              className="relative min-w-0"
            />
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary sm:h-[42px] sm:w-[42px]"
              title="רענון"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <PageMain>
        <div className="flex-1 px-4 pb-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-base font-medium text-red-500">שגיאה בטעינת {title}</p>
              <button onClick={() => mutate()} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">
                נסה שוב
              </button>
            </div>
          ) : visibleSeries.length === 0 ? (
            <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium text-foreground">לא נמצאו סדרות</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {visibleSeries.map((item) => {
                const image = getSeriesImage(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/${providerPath}/${encodeURIComponent(item.id)}`)}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-right transition-colors hover:border-primary/60 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden bg-background">
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Clapperboard className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
                        <Play className="h-3.5 w-3.5" />
                        {getEpisodeCountText(item.episodeCount)}
                      </div>
                    </div>

                    <div className="min-w-0 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</h3>
                        <ChevronLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                      </div>
                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                      {item.program_genre ? (
                        <div className="mt-3 inline-flex max-w-full rounded-full border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
                          <span className="truncate">{item.program_genre}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!isLoading && !error && visibleSeries.length > 0 ? (
            <div ref={loadMoreRef} className="flex h-16 items-center justify-center">
              {hasMore || isLoadingMore ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {lastPage?.total ? `${visibleSeries.length} מתוך ${lastPage.total}` : null}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </PageMain>
    </div>
  );
}
