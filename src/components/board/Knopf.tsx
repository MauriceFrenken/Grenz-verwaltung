import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const knopfVarianten = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        primaer:
          "bg-primary text-primary-foreground shadow-[0_1px_0_0_rgb(0_0_0/0.08)] hover:bg-primary/90",
        sekundaer:
          "border border-input bg-surface text-foreground shadow-[0_1px_0_0_rgb(0_0_0/0.03)] hover:bg-surface-muted",
        geist: "text-text-muted hover:bg-surface-muted hover:text-foreground",
        gefahr: "bg-bad text-white hover:bg-bad/90",
      },
      groesse: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: { variante: "sekundaer", groesse: "md" },
  },
);

export interface KnopfProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof knopfVarianten> {
  asChild?: boolean;
}

export const Knopf = React.forwardRef<HTMLButtonElement, KnopfProps>(
  ({ className, variante, groesse, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(knopfVarianten({ variante, groesse }), className)}
        {...props}
      />
    );
  },
);
Knopf.displayName = "Knopf";

/** Tastenkürzel-Hinweis, z. B. <Taste>⌘K</Taste> */
export function Taste({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hairline bg-surface-muted px-1 font-sans text-[11px] font-medium text-text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
