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

export default function TopNav({ className }: { className?: string }) {
    const pathname = usePathname()

    return (
        <nav className={cn("rounded-xl border border-border/70 bg-background/45 p-1 shadow-inner shadow-black/10", className)}>
            <div className="flex items-center gap-1">
                {NAV_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className={navLinkClass(pathname, item.href)}>
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="leading-none">{item.label}</span>
                    </Link>
                ))}
            </div>
        </nav>
    )
}
