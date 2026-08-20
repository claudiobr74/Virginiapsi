import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        secondary:
          "bg-surface text-deep-neutral border border-border hover:bg-sage-light/30",
        destructive: "bg-failed text-white hover:opacity-90",
        ghost: "text-deep-neutral hover:bg-surface",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 shrink-0 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    // Radix Slot requires exactly one React element child to merge props
    // onto. isLoading's spinner is only meaningful for a real <button> — an
    // asChild caller (e.g. wrapping a Link) owns its own content, so we pass
    // its single child through untouched instead of adding a sibling node.
    const content = asChild ? (
      children
    ) : (
      <>
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        {children}
      </>
    );

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild
          ? {}
          : { disabled: disabled || isLoading, "aria-busy": isLoading || undefined })}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";
