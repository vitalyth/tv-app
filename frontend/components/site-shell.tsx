"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import { APP_VERSION } from "@/lib/version";
import { FloatingPlayerProvider } from "@/context/floating-player-context";

export default function SiteShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLiveRoute = pathname === "/live" || pathname.startsWith("/live/");
    const title = pathname === "/" ? "בית" : pathname.startsWith("/vod") ? "VOD" : "מדריך שידורים";

    useEffect(() => {
        if (isLiveRoute) return;

        const updateHeaderHeight = () => {
            const header = document.querySelector<HTMLElement>(".site-header");
            if (!header) return;

            document.documentElement.style.setProperty(
                "--site-header-height",
                `${header.offsetHeight}px`
            );
        };

        updateHeaderHeight();
        window.addEventListener("resize", updateHeaderHeight);

        return () => window.removeEventListener("resize", updateHeaderHeight);
    }, [isLiveRoute]);

    if (isLiveRoute) {
        return <>{children}</>;
    }

    return (
        <FloatingPlayerProvider>
            <div className="app-shell flex h-dvh flex-col bg-background">
                <Header title={title} />

                <div className="site-content flex-1 min-h-0 flex flex-col">
                    {children}
                </div>

                <footer className="shrink-0 border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                    ערוצי טלוויזיה · v{APP_VERSION}
                </footer>
            </div>
        </FloatingPlayerProvider>
    );
}
