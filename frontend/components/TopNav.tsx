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

export const NAV_ITEMS = [
    { href: "/", label: "בית" },
    { href: "/guide", label: "מדריך שידורים" },
    { href: "/vod", label: "VOD" },
]

export const isNavItemActive = (pathname: string, href: string) => {
    if (href === "/") return pathname === "/"
    return pathname === href || pathname.startsWith(href + "/")
}

export const navLinkClass = (pathname: string, href: string) =>
    cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
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
                                {item.label}
                            </Link>
                        </NavigationMenuLink>
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    )
}
