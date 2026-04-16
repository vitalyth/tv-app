import { useCallback, useEffect, useRef, useState } from "react";

interface Position {
    x: number;
    y: number;
}

interface UseDraggableReturn {
    position: Position | null;
    isDragging: boolean;
    dragHandleProps: {
        onMouseDown: (e: React.MouseEvent) => void;
        onTouchStart: (e: React.TouchEvent) => void;
        style: React.CSSProperties;
    };
    restorePosition: () => void;
}

export function useDraggable(
    containerRef: React.RefObject<HTMLElement | null>,
    enabled = true
): UseDraggableReturn {
    const [position, setPosition] = useState<Position | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    // const savedPosition = useRef<Position | null>(null);

    const dragStart = useRef<{
        mouseX: number;
        mouseY: number;
        elemX: number;
        elemY: number;
    } | null>(null);

    const frame = useRef<number | null>(null);
    const lastPos = useRef<Position | null>(null);

    // ── Clamp ───────────────────────────────────────────
    const clamp = useCallback((x: number, y: number): Position => {
        if (!containerRef.current) return { x, y };

        const { offsetWidth: w, offsetHeight: h } = containerRef.current;

        return {
            x: Math.max(0, Math.min(x, window.innerWidth - w)),
            y: Math.max(0, Math.min(y, window.innerHeight - h)),
        };
    }, [containerRef]);

    // ── RAF ─────────────────────────────────────────────
    const updatePosition = useCallback((x: number, y: number) => {
        lastPos.current = { x, y };

        if (frame.current) cancelAnimationFrame(frame.current);

        frame.current = requestAnimationFrame(() => {
            if (containerRef.current && lastPos.current) {
                containerRef.current.style.transform =
                    `translate(${lastPos.current.x}px, ${lastPos.current.y}px)`;
            }
        });
    }, [containerRef]);

    // ── Mouse ───────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (!enabled || window.innerWidth < 500 || !containerRef.current) return;

        e.preventDefault();

        const rect = containerRef.current.getBoundingClientRect();

        dragStart.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            elemX: Math.round(rect.left),
            elemY: Math.round(rect.top),
        };

        setPosition({ x: rect.left, y: rect.top });
        setIsDragging(true);
    }, [enabled, containerRef]);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!dragStart.current) return;

            const dx = e.clientX - dragStart.current.mouseX;
            const dy = e.clientY - dragStart.current.mouseY;

            const pos = clamp(
                dragStart.current.elemX + dx,
                dragStart.current.elemY + dy
            );

            updatePosition(pos.x, pos.y);
        };

        const onMouseUp = () => {
            if (dragStart.current && lastPos.current) {
                setPosition(lastPos.current);
            }

            dragStart.current = null;
            setIsDragging(false);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [clamp, updatePosition]);

    // ── Touch ───────────────────────────────────────────
    const onTouchStart = useCallback((e: React.TouchEvent) => {
      if (!enabled || window.innerWidth < 500 || !containerRef.current) return;
  
      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
  
      dragStart.current = {
        mouseX: touch.clientX,
        mouseY: touch.clientY,
        elemX: rect.left,
        elemY: rect.top,
      };
  
      setPosition({ x: rect.left, y: rect.top });
  
      setIsDragging(true);
    }, [enabled, containerRef]);

    const restorePosition = useCallback(() => {
        if (lastPos.current) {
            const pos = lastPos.current;
            setPosition(pos);
            updatePosition(pos.x, pos.y);
        }
    }, []);

    useEffect(() => {
      const onTouchMove = (e: TouchEvent) => {
        if (!dragStart.current) return;
  
        e.preventDefault();
  
        const touch = e.touches[0];
  
        const dx = touch.clientX - dragStart.current.mouseX;
        const dy = touch.clientY - dragStart.current.mouseY;
  
        const pos = clamp(
          dragStart.current.elemX + dx,
          dragStart.current.elemY + dy
        );
  
        updatePosition(pos.x, pos.y);
      };
  
      const onTouchEnd = () => {
        if (dragStart.current && lastPos.current) {
          setPosition(lastPos.current);
        }
  
        dragStart.current = null;
        setIsDragging(false);
      };
  
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
  
      return () => {
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
      };
    }, [clamp, updatePosition]);

    return {
        position,
        isDragging,
        dragHandleProps: {
            onMouseDown,
            onTouchStart,
            style: {
                cursor: isDragging ? "grabbing" : "grab",
                userSelect: "none",
                touchAction: "none",
            },
        },
        restorePosition,
    };
}