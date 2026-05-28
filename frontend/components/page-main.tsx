import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type PageMainProps = ComponentPropsWithoutRef<"main">;

export const PageMain = forwardRef<HTMLElement, PageMainProps>(function PageMain(
  { className, children, ...props },
  ref
) {
  return (
    <main
      ref={ref}
      className={cn(
        "app-page-main flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto styled-scrollbar",
        className
      )}
      {...props}
    >
      {children}
    </main>
  );
});
