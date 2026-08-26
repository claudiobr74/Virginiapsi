import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  narrow?: boolean;
}

export function PageContainer({
  className,
  narrow = false,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        narrow ? "max-w-3xl" : "max-w-[1200px]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
