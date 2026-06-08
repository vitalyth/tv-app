"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import { APP_VERSION } from "@/lib/version";
import { FloatingPlayerProvider } from "@/context/floating-player-context";
import { GlobalLoadingIndicator } from "@/components/global-loading-indicator";

const getPageTitle = (pathname: string) => {
    if (pathname === "/") return "בית";
    if (pathname.startsWith("/vod")) return "VOD";
    if (pathname.startsWith("/local-series")) return "סדרות";
    if (pathname.startsWith("/kan-vod")) return "כאן VOD";
    if (pathname.startsWith("/guide")) return "שידורים חיים";
    return "שידורים חיים";
};

export default function SiteShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLiveRoute = pathname === "/live" || pathname.startsWith("/live/");
    const title = getPageTitle(pathname);

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
        return (
            <>
                <GlobalLoadingIndicator />
                {children}
            </>
        );
    }

    return (
        <FloatingPlayerProvider>
            <GlobalLoadingIndicator />
            <div className="app-shell flex h-dvh flex-col bg-background">
                <Header title={title} />

                <div className="site-content flex-1 min-h-0 flex flex-col">
                    {children}
                </div>

                <footer className="shrink-0 border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                    TV App · v{APP_VERSION}
                </footer>
            </div>
        </FloatingPlayerProvider>
    );
}
