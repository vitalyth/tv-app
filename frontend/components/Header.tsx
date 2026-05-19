"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Tv, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import TopNav, { NAV_ITEMS, navLinkClass } from "./TopNav";
import { APP_VERSION } from "@/lib/version";

type Props = {
    title?: string;
    onClose?: () => void;
    onToggleSidebar?: () => void;
};

export default function Header({ title = 'שידורים חיים', onClose, onToggleSidebar }: Props) {
    const pathname = usePathname();

    return (
        <header className="site-header relative z-[300] shrink-0 bg-card border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
                {/* Back button + Logo */}
                <div className="flex min-w-0 items-center gap-3">
                    {onClose && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    )}
                    <Link
                        href="/"
                        className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label="מעבר לעמוד הבית"
                    >
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-primary flex items-center justify-center">
                            <Tv className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-xl font-bold text-foreground">ערוצי טלוויזיה</h1>
                            <p className="truncate text-xs text-muted-foreground">
                                {title} · v{APP_VERSION}
                            </p>
                        </div>
                    </Link>
                </div>

                {/* Live indicator + Mobile menu */}
                <div className="flex items-center gap-3">
                    
                    <TopNav className="hidden md:flex" />

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline"
                                size="icon"
                                className="md:hidden"
                                aria-label="פתח תפריט ניווט"
                            >
                                <Menu className="w-5 h-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            overlayClassName="z-[9998] md:z-[390]"
                            className="z-[9999] md:z-[400] w-72 max-w-[85vw] border-border bg-card p-0"
                            dir="rtl"
                        >
                            <SheetHeader className="border-b border-border p-4 text-right">
                                <SheetTitle>ניווט</SheetTitle>
                            </SheetHeader>
                            <nav className="flex flex-col gap-2 p-4">
                                {NAV_ITEMS.map((item) => (
                                    <SheetClose key={item.href} asChild>
                                        <Link href={item.href} className={navLinkClass(pathname, item.href)}>
                                            <item.icon className="h-4 w-4" aria-hidden="true" />
                                            {item.label}
                                        </Link>
                                    </SheetClose>
                                ))}
                            </nav>
                        </SheetContent>
                    </Sheet>
                    
                    {/* Mobile menu button */}
                    {onToggleSidebar &&
                        <Button
                            variant="outline"
                            size="icon"
                            className="lg:hidden"
                            onClick={onToggleSidebar}
                            aria-label="פתח רשימת ערוצים"
                        >
                            <Tv className="w-5 h-5" />
                        </Button>
                    }
                </div>

            </div>
        </header>
    );
}
