import { cn } from "cn";
import { PolemicMark } from "@/components/PolemicLogo";
import { STOPLIGHT_WIDTH, hasTrafficLights } from "@/lib/platform";
import { isWeb } from "@/lib/target";
import { t } from "@scholarkit/i18n";

/** A grey placeholder for something the loading screen doesn't have yet. */
function Bone({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-pulse rounded bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * Shown until the app knows whether a project reopens. Polemic's layout comes
 * first, with placeholders where the header, the rail and the panels go and a
 * spinner where the project opens, so nothing jumps when it is there. Cursive
 * and Binder load the same way.
 */
export function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div
        className="flex h-11 shrink-0 items-center justify-between pr-3"
        style={hasTrafficLights ? { paddingLeft: STOPLIGHT_WIDTH } : undefined}
      >
        <div className="flex min-w-0 items-center gap-3 pl-3">
          <div className="flex flex-none items-center gap-1">
            <span className="grid size-7 place-items-center">
              <PolemicMark className="size-[22px]" />
            </span>
            {isWeb && <Bone className="mx-1.5 size-4" />}
          </div>
          <Bone className="h-2.5 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Bone className="h-7 w-24 rounded-md" />
          <Bone className="h-7 w-20 rounded-md" />
          <Bone className="ml-1 size-7 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 py-1 pl-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Bone key={index} className="m-2 size-4" />
          ))}
          <div className="mt-auto flex flex-col items-center gap-1 pb-1">
            {Array.from({ length: 4 }, (_, index) => (
              <Bone key={index} className="m-2 size-4" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 gap-2 pr-2 pb-2 pl-2">
          <div className="hidden w-44 shrink-0 flex-col gap-3 rounded-xl border bg-card p-3 md:flex">
            <Bone className="h-2.5 w-12" />
            <Bone className="mt-2 h-2.5 w-28" />
            <Bone className="h-2.5 w-20" />
            <Bone className="h-2.5 w-24" />
          </div>
          <div className="grid min-w-0 flex-1 place-items-center rounded-xl border bg-card">
            <div className="flex flex-col items-center gap-3" role="status">
              <span
                aria-hidden
                className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none"
              />
              <p className="text-sm text-muted-foreground">{t("Opening Polemic…")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
