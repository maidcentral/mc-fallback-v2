import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

const Button = React.forwardRef(({ className, variant = "default", size = "default", showChevron = false, children, ...props }, ref) => {
  const baseStyles = "inline-flex items-center justify-center rounded-full text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background"

  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    primary: "bg-[#BF9F50] hover:bg-[#A88A43] text-white border-2 border-[#1A1A1A] shadow-sm",
    mcBlue: "bg-[#0382E5] hover:bg-[#005DA5] text-white border-2 border-[#1A1A1A] shadow-sm",
    mcTeal: "bg-[#01726B] hover:bg-[#005952] text-white border-2 border-[#1A1A1A] shadow-sm",
    destructive: "border-2 border-red-600 text-red-600 hover:bg-red-50 active:bg-red-600 active:text-white",
    outline: "border-2 border-gray-300 hover:bg-gray-50 hover:border-gray-400",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-2 border-gray-300",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "underline-offset-4 hover:underline text-primary"
  }

  const sizes = {
    default: "h-11 py-2 px-6",
    sm: "h-9 px-4 text-xs",
    lg: "h-12 px-8 text-base",
    icon: "h-10 w-10"
  }

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      ref={ref}
      {...props}
    >
      {showChevron && <ChevronRight className="w-4 h-4 mr-2" />}
      {children}
      {showChevron && <ChevronRight className="w-4 h-4 ml-2" />}
    </button>
  )
})
Button.displayName = "Button"

export { Button }
