import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, Link2, Loader2, UserRoundPlus } from "lucide-react";
import {
  InviteForm,
  LeaveConfirm,
  PublishedLine,
  ShareProblem,
  ShareStart,
  SyncNotice,
  invitedLine,
  useCopied,
} from "@/components/ShareParts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STEP_LABELS, copyText, useShare, type Share } from "@/hooks/useShare";
import { features } from "@/lib/target";
import type { ProjectMembers } from "@/lib/tauri";
import { useDialogsStore } from "@/store/dialogs";
import { formatList, t, tn } from "@scholarkit/i18n";

/** Who the project is shared with, in a line; null when with no one. */
export function peopleLine(people: ProjectMembers | null): string | null {
  if (!people) return null;
  const names = people.members.map((m) => m.name);
  const invited = people.invites.length;
  const waiting =
    invited > 0
      ? tn(invited, "{count} invite pending", "{count} invites pending")
      : null;
  if (names.length === 0) return waiting;
  const who =
    names.length <= 2
      ? formatList(names)
      : tn(
          names.length - 2,
          "{first}, {second} and {count} more",
          "{first}, {second} and {count} more",
          {
            first: names[0],
            second: names[1],
          },
        );
  const shared = t("Shared with {who}", { who });
  return waiting ? `${shared} · ${waiting}` : shared;
}

/**
 * The toolbar's Share button. Its popover covers the quick steps:
 * invite someone and copy a review link; the rest is in the Share
 * dialog, one click away.
 */
export function SharePopover() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t("Share this project")}>
          <UserRoundPlus />
          {t("Share")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 gap-0 p-0"
        // The top bar drags the window from anywhere that isn't a control.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Mounted while open, so each opening starts fresh. */}
        <ShareQuick close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function ShareQuick({ close }: { close: () => void }) {
  const share = useShare();
  const [leaving, setLeaving] = useState(false);
  const { status, info, invited, owner, shared, projectPage } = share;

  const manage = () => {
    close();
    useDialogsStore.getState().setShareOpen(true);
  };

  const openInBrowser = projectPage && (
    <Button size="sm" variant="ghost" onClick={() => void openUrl(projectPage)}>
      <ExternalLink />
      {t("Open in browser")}
    </Button>
  );

  if (share.loading) {
    return (
      <div className="p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === null || share.signedOut || (!shared && features.localFiles)) {
    return (
      <div className="space-y-2 p-4">
        <h3 className="text-sm font-medium">{t("Share this project")}</h3>
        {status !== null && <ShareStart share={share} />}
        <ShareProblem share={share} />
      </div>
    );
  }

  if (invited) {
    return (
      <>
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-medium">
            {t("Shared by")} {info?.owner?.name ?? t("someone else")}
          </h3>
          <p className="text-xs text-muted-foreground">{invitedLine(share)}</p>
          <SyncNotice share={share} />
          {leaving && <LeaveConfirm share={share} onCancel={() => setLeaving(false)} />}
          <ShareProblem share={share} />
        </div>
        {!leaving && (
          <div className="flex items-center justify-between border-t p-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setLeaving(true)}
            >
              {t("Leave project…")}
            </Button>
            {openInBrowser}
          </div>
        )}
      </>
    );
  }

  const line = peopleLine(share.people);
  return (
    <>
      {(share.linkStatus?.kind === "offline" ||
        share.linkStatus?.kind === "full" ||
        share.linkStatus?.kind === "failed" ||
        share.linkStatus?.kind === "signedOut") && (
        <div className="p-4 pb-0">
          <SyncNotice share={share} />
        </div>
      )}
      {owner && share.people && (
        <section className="space-y-2 p-4">
          <h3 className="text-sm font-medium">{t("Invite people")}</h3>
          <InviteForm share={share} />
          {line && <p className="text-xs text-muted-foreground">{line}</p>}
        </section>
      )}
      <section className="space-y-2 border-t p-4 first:border-t-0">
        <h3 className="text-sm font-medium">{t("Review link")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Anyone with the link can read and comment on what you published last.")}
        </p>
        <ReviewLinkButton share={share} />
        <PublishedLine share={share} />
        <ShareProblem share={share} />
      </section>
      <div className="flex items-center justify-between border-t p-2">
        <Button size="sm" variant="ghost" onClick={manage}>
          {t("Manage sharing…")}
        </Button>
        {openInBrowser}
      </div>
    </>
  );
}

/**
 * Copies the review link made on this device; without one, makes a
 * link that allows comments (publishing first when nothing is
 * published yet) and copies that.
 */
function ReviewLinkButton({ share }: { share: Share }) {
  const [copied, markCopied] = useCopied();
  const known = share.links.find(
    (l) => l.active && l.role === "commenter" && share.urls[l.id],
  );
  const working = share.busy === "link";

  async function go() {
    let url = known ? share.urls[known.id] : undefined;
    if (!url) url = (await share.createLink("commenter", null))?.url;
    if (url && (await copyText(url))) markCopied(true);
  }

  return (
    <Button
      size="sm"
      variant={known ? "outline" : "default"}
      disabled={working || share.step !== null}
      onClick={() => void go()}
    >
      {working ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <Link2 />}
      {working
        ? share.step
          ? STEP_LABELS[share.step]
          : t("Creating link…")
        : copied
          ? t("Copied")
          : known
            ? t("Copy review link")
            : share.links.length > 0
              ? t("New review link")
              : t("Create review link")}
    </Button>
  );
}
