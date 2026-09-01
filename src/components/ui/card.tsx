import type { HTMLAttributes, ReactNode } from "react";
import { ToneIcon } from "@/components/ui/tone-icon";
import {
  type SurfaceTone,
  TONE_OUTLINE,
  TONE_SURFACE,
  toneHeaderClass,
} from "@/lib/ui/surface-tone";
import { cn } from "@/lib/utils/cn";

export type CardTone = SurfaceTone;

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: CardTone;
  headed?: boolean;
  interactive?: boolean;
  icon?: ReactNode;
  title?: ReactNode;
  titleId?: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function Card({
  tone = "neutral",
  headed = false,
  interactive = false,
  icon,
  title,
  titleId,
  description,
  action,
  children,
  className,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || icon || action || description);

  if (headed) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[20px] border shadow-card",
          TONE_OUTLINE[tone],
          interactive && "card-interactive",
          className,
        )}
        {...props}
      >
        {hasHeader ? (
          <div
            className={cn(
              "flex items-start justify-between gap-3 border-b px-5 py-3.5 sm:px-6",
              toneHeaderClass(tone),
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              {icon ? <ToneIcon tone={tone}>{icon}</ToneIcon> : null}
              <div className="flex min-w-0 flex-col gap-0.5">
                {title ? (
                  <h2
                    id={titleId}
                    className="font-serif text-[18px] font-semibold leading-tight text-foreground sm:text-[20px]"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p className="text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
            {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-4 bg-card px-5 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[20px] border p-5 shadow-card sm:p-6",
        TONE_SURFACE[tone],
        interactive && "card-interactive",
        className,
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <ToneIcon tone={tone}>{icon}</ToneIcon> : null}
            <div className="flex min-w-0 flex-col gap-0.5">
              {title ? (
                <h2
                  id={titleId}
                  className="font-serif text-[18px] font-semibold leading-tight text-foreground sm:text-[22px]"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
