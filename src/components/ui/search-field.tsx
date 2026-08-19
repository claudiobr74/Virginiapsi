"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface SearchFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, value, onChange, onClear, placeholder = "Buscar…", ...props }, ref) => {
    return (
      <div className={cn("relative flex-1", className)}>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={ref}
          type="search"
          role="searchbox"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-input py-2 pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...props}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              onClear?.();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">Limpar busca</span>
          </button>
        ) : null}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
