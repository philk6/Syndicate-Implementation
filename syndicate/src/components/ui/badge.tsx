import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 backdrop-blur-md text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
        secondary:
          "border-neutral-500/20 bg-neutral-500/10 text-neutral-400 hover:bg-neutral-500/20",
        destructive:
          "border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
        outline: "border-white/[0.08] bg-white/[0.03] text-neutral-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
