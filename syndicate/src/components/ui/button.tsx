import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30",
        destructive:
          "bg-rose-500/10 text-rose-400 font-medium border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)] hover:bg-rose-500/20 hover:shadow-[0_0_20px_rgba(244,63,94,0.1)] hover:border-rose-500/30",
        outline:
          "bg-amber-500/5 text-amber-400 font-medium border border-amber-500/15 shadow-[0_0_10px_rgba(245,158,11,0.03)] hover:bg-amber-500/10 hover:border-amber-500/25",
        secondary:
          "bg-white/[0.05] text-amber-400 font-medium border border-white/[0.1] hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-300",
        ghost:
          "text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20",
        link: "text-amber-400 underline-offset-4 hover:underline hover:text-amber-300",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-xl px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
