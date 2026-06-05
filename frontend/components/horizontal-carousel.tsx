"use client";

import { Children, useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const carouselCardClass = "w-[78vw] max-w-[20rem] shrink-0 sm:w-[18rem] lg:w-[19rem]";
const carouselScrollTolerance = 12;
const dragClickTolerance = 6;

export function HorizontalCarousel({
  children,
  itemClassName = carouselCardClass,
}: {
  children: ReactNode;
  itemClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({
    isPointerDown: false,
    isDragging: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
  });
  const suppressClickRef = useRef(false);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const items = Children.toArray(children);

  const updateScrollButtons = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    const scrollOffset = Math.abs(scrollLeft);

    setCanScrollBack(scrollOffset > carouselScrollTolerance);
    setCanScrollForward(maxScroll - scrollOffset > carouselScrollTolerance);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const frame = requestAnimationFrame(updateScrollButtons);

    const container = scrollRef.current;
    if (!container) {
      cancelAnimationFrame(frame);
      return;
    }

    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [items.length, updateScrollButtons]);

  const scroll = (direction: "forward" | "back") => {
    const container = scrollRef.current;
    if (!container) return;

    const amount = Math.min(container.clientWidth * 0.85, 720);
    container.scrollBy({
      left: direction === "forward" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    const container = scrollRef.current;
    if (!container) return;

    dragStateRef.current = {
      isPointerDown: true,
      isDragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    const dragState = dragStateRef.current;
    if (!container || !dragState.isPointerDown || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    if (!dragState.isDragging && Math.abs(deltaX) < dragClickTolerance) return;

    if (!dragState.isDragging) {
      dragState.isDragging = true;
      setIsDragging(true);
      container.setPointerCapture(event.pointerId);
    }

    event.preventDefault();

    container.scrollLeft = dragState.startScrollLeft - deltaX;
    updateScrollButtons();
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    const dragState = dragStateRef.current;
    if (!dragState.isPointerDown || dragState.pointerId !== event.pointerId) return;

    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    suppressClickRef.current = dragState.isDragging;
    if (dragState.isDragging) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragStateRef.current = {
      isPointerDown: false,
      isDragging: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
    };
    setIsDragging(false);
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return (
    <div className="relative">
      {canScrollBack && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-linear-to-l from-background to-transparent sm:w-14" />
      )}
      {canScrollForward && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-linear-to-r from-background to-transparent sm:w-14" />
      )}

      {canScrollBack && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scroll("back")}
          className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-card/95 shadow-lg"
          aria-label="גלול אחורה"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
      {canScrollForward && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => scroll("forward")}
          className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-card/95 shadow-lg"
          aria-label="גלול קדימה"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={handleClickCapture}
        className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pl-1 pr-1 scrollbar-hide sm:gap-4 ${isDragging ? "cursor-grabbing snap-none select-none" : "cursor-grab scroll-smooth"}`}
      >
        {items.map((child, index) => (
          <div key={index} className={`${itemClassName} snap-start *:w-full`}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
