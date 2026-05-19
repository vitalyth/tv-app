"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuItem,
    NavigationMenuLink,
} from "@/components/ui/navigation-menu"
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

export const navLinkClass = (pathname: string, href: string) =>
    cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        isNavItemActive(pathname, href)
            ? "bg-red-600 text-white"
            : "text-gray-400 hover:text-white hover:bg-zinc-800"
    )

export default function TopNav({ className }: { className?: string }) {
    const pathname = usePathname()

    return (
        <NavigationMenu className={className}>
            <NavigationMenuList className="flex gap-2">
                {NAV_ITEMS.map((item) => (
                    <NavigationMenuItem key={item.href}>
                        <NavigationMenuLink asChild>
                            <Link href={item.href} className={navLinkClass(pathname, item.href)}>
                                <item.icon className="h-4 w-4" aria-hidden="true" />
                                {item.label}
                            </Link>
                        </NavigationMenuLink>
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    )
}
