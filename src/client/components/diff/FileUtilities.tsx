import { Copy, Link, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "../../lib/clipboard.js";
import { buildDiffDeepLink, hasCapabilityToken, readDiffLocation } from "../../lib/deepLink.js";
import { openInEditor } from "../../lib/editor.js";
import { Button } from "../ui/button.js";
import { FileCommentButton } from "./FileCommentButton.js";

export function FileUtilities({
  editorEnabled,
  fileCommentDraft,
  onFileCommentDraftChange,
  onFileCommentSubmit,
  path,
}: {
  editorEnabled: boolean;
  fileCommentDraft: string;
  onFileCommentDraftChange: (body: string) => void;
  onFileCommentSubmit: (body: string) => void;
  path: string;
}) {
  const copyPath = async () => {
    try {
      await copyTextToClipboard(path);
      toast.success("Copied file path");
    } catch {
      toast.error("Unable to copy file path");
    }
  };

  const copyLink = async () => {
    const currentHref = window.location.href;
    const selectedLocation = readDiffLocation(currentHref);
    const location =
      selectedLocation.file === path
        ? { line: selectedLocation.line, side: selectedLocation.side }
        : undefined;
    try {
      await copyTextToClipboard(buildDiffDeepLink(currentHref, path, location));
      toast.success("Copied link to file", {
        description: hasCapabilityToken(currentHref)
          ? "This remote-mode link contains the access token. Treat it as a secret."
          : undefined,
      });
    } catch {
      toast.error("Unable to copy file link");
    }
  };

  const openFile = async () => {
    if (!editorEnabled) {
      toast.error("No editor is configured", { description: "Restart DiffDeck with --editor." });
      return;
    }
    const location = readDiffLocation(window.location.href);
    const line = location.file === path ? (location.line ?? 1) : 1;
    try {
      await openInEditor(path, line);
      toast.success(line > 1 ? `Opened ${path}:${line}` : `Opened ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex items-center gap-0.5 font-sans" data-diffdeck-shortcuts-disabled>
      <FileCommentButton
        draft={fileCommentDraft}
        onDraftChange={onFileCommentDraftChange}
        onSubmit={onFileCommentSubmit}
        path={path}
      />
      <UtilityButton label={`Copy path for ${path}`} onClick={() => void copyPath()}>
        <Copy />
      </UtilityButton>
      <UtilityButton label={`Copy link to ${path}`} onClick={() => void copyLink()}>
        <Link />
      </UtilityButton>
      {editorEnabled ? (
        <UtilityButton label={`Open ${path} in editor`} onClick={() => void openFile()}>
          <SquareArrowOutUpRight />
        </UtilityButton>
      ) : null}
    </div>
  );
}

function UtilityButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
      onClick={onClick}
      size="icon"
      title={label}
      variant="ghost"
    >
      {children}
    </Button>
  );
}
