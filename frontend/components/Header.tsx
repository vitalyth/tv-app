import { Tv, X, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  title?: string;
  onClose?: () => void;
  onToggleSidebar?: () => void;
};

export default function Header({title = 'שידורים חיים', onClose, onToggleSidebar}: Props) {
  return (
      <header className="shrink-0 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back button + Logo */}
          <div className="flex items-center gap-3">
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
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Tv className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">ערוצי טלוויזיה</h1>
              <p className="text-xs text-muted-foreground">{title}</p>
            </div>
          </div>

          {/* Live indicator + Mobile menu */}
          <div className="flex items-center gap-3">
            {/*
            <div className="flex items-center gap-2 bg-primary/10 px-3 py-2 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium text-primary hidden sm:inline">שידור חי</span>
            </div>
            */}

            {/* Mobile menu button */}
            {onToggleSidebar && 
                <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                onClick={onToggleSidebar}
                >
                <Menu className="w-5 h-5" />
                </Button>
            }           
          </div>
        </div>
      </header>
  );
}