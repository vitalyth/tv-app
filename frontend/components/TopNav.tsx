"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuItem,
    NavigationMenuLink,
} from "@/components/ui/navigation-menu"

export default function TopNav() {
    const pathname = usePathname()

    const base =
        "px-4 py-2 rounded-lg text-sm font-medium transition-colors"
    const inactive =
        "text-gray-400 hover:text-white hover:bg-zinc-800"
    const active =
        "bg-red-600 text-white"

    const linkClass = (path: string) => {
        const isActive =
            pathname === path || pathname.startsWith(path + "/")

        return `px-4 py-2 rounded-lg text-sm font-medium ${isActive
                ? "bg-red-600 text-white"
                : "text-gray-400 hover:text-white"
            }`
    }

    return (
        <NavigationMenu>
            <NavigationMenuList className="flex gap-2">

                <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                        <Link href="/guide" className={linkClass("/guide")}>
                            🔴 שידורים חיים
                        </Link>
                    </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                        <Link href="/live" className={linkClass("/live")}>
                            ▶️ VOD
                        </Link>
                    </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                    <NavigationMenuLink asChild>
                        <Link href="/movies" className={linkClass("/movies")}>
                            🎬 סרטים
                        </Link>
                    </NavigationMenuLink>
                </NavigationMenuItem>

            </NavigationMenuList>
        </NavigationMenu>
    )
}