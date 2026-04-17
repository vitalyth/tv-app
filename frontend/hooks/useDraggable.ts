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
    restorePosition: (reset?: boolean) => void;
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

    const startDrag = useCallback((clientX: number, clientY: number) => {
        if (!enabled || !containerRef.current) return;

        containerRef.current.getBoundingClientRect();

        const rect = containerRef.current.getBoundingClientRect();

        const startX =
            lastPos.current?.x ??
            position?.x ??
            Math.round(rect.left);

        const startY =
            lastPos.current?.y ??
            position?.y ??
            Math.round(rect.top);

        dragStart.current = {
            mouseX: clientX,
            mouseY: clientY,
            elemX: startX,
            elemY: startY,
        };

        lastPos.current = { x: startX, y: startY };

        containerRef.current.style.transform =
            `translate(${startX}px, ${startY}px)`;

        setPosition({ x: startX, y: startY });
        setIsDragging(true);
    }, [enabled, containerRef, position]);

    // ── Mouse ───────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    }, [startDrag]);

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
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
    }, [startDrag]);

    const restorePosition = useCallback((reset = false) => {
        if (reset) {
            lastPos.current = null;
            setPosition(null);
            if (containerRef.current) {
                containerRef.current.style.transform = "";
            }
            return;
        }

        if (lastPos.current) {
            const pos = lastPos.current;
            setPosition(pos);
            updatePosition(pos.x, pos.y);
        }
    }, [containerRef, updatePosition]);

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