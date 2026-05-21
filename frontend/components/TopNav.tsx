"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Clapperboard, Home, Tv, type LucideIcon } from "lucide-react"

export const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
    { href: "/", label: "בית", icon: Home },
    { href: "/guide", label: "מדריך שידורים", icon: Tv },
    { href: "/vod", label: "VOD", icon: Clapperboard },
]

export const isNavItemActive = (pathname: string, href: string) => {
    if (href === "/") return pathname === "/"
    return pathname === href || pathname.startsWith(href + "/")
}

type NavLinkVariant = "desktop" | "mobile"

export const navLinkClass = (pathname: string, href: string, variant: NavLinkVariant = "desktop") => {
    const isActive = isNavItemActive(pathname, href)

    return cn(
        "inline-flex items-center gap-2 overflow-hidden font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60",
        variant === "desktop"
            ? "h-8 min-w-24 justify-center rounded-lg border px-3.5 text-sm"
            : "h-11 w-full justify-start rounded-lg border px-3 text-sm",
        isActive
            ? "border-primary/60 bg-primary/15 text-primary shadow-sm"
            : variant === "desktop"
                ? "border-transparent text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
                : "border-border/70 bg-background/35 text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
    )
}

import { useEffect, useRef } from "react";

export default function TopNav({ className }: { className?: string }) {
    const pathname = usePathname();
    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const links = Array.from(nav.querySelectorAll('a'));
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            const idx = links.indexOf(active as HTMLElement);
            // RTL: חץ ימין = קדימה, שמאלה = אחורה
            const isRTL = getComputedStyle(nav).direction === 'rtl';
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                let nextIdx = idx;
                if (isRTL) {
                    if (e.key === 'ArrowRight') nextIdx = Math.min(idx + 1, links.length - 1);
                    if (e.key === 'ArrowLeft') nextIdx = Math.max(idx - 1, 0);
                } else {
                    if (e.key === 'ArrowRight') nextIdx = Math.max(idx - 1, 0);
                    if (e.key === 'ArrowLeft') nextIdx = Math.min(idx + 1, links.length - 1);
                }
                if (nextIdx !== idx && links[nextIdx]) {
                    (links[nextIdx] as HTMLElement).focus();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            // חץ למטה: פוקוס לקרוסלה הראשונה
            if (e.key === 'ArrowDown') {
                const firstCarousel = document.querySelector('[data-carousel-item]');
                if (firstCarousel) {
                    (firstCarousel as HTMLElement).focus();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };
        nav.addEventListener('keydown', handleKeyDown);
        return () => nav.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <nav className={cn("rounded-xl border border-border/70 bg-background/45 p-1 shadow-inner shadow-black/10", className)}>
            <div className="flex items-center gap-1" ref={navRef}>
                {NAV_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className={navLinkClass(pathname, item.href)} tabIndex={0}>
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="leading-none">{item.label}</span>
                    </Link>
                ))}
            </div>
        </nav>
    );
}
