
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

// Pass a name with aria-label (or aria-labelledby): a progress bar without one
// is announced as just "progress bar".
const Progress = React.forwardRef(({ className, value, ...props }, ref) => {
  // Radix reports aria-valuenow only for a finite value between 0 and max.
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-slate-700/60",
        className
      )}
      value={pct}
      {...props}>
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-[#22d3ee] transition-all"
        style={{ transform: `translateX(-${100 - (pct || 0)}%)` }} />
    </ProgressPrimitive.Root>
  );
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
