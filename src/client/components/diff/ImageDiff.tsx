import { useEffect, useMemo, useState } from "react";
import { Columns2, Layers3, PanelLeftClose } from "lucide-react";
import { fetchJson } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/button.js";

type Mode = "side-by-side" | "overlay" | "swipe";
interface ImageSide {
  bytes: number;
  data: string;
  mimeType: string;
  side: "old" | "new";
}

export function ImageDiff({ path }: { path: string }) {
  const [mode, setMode] = useState<Mode>("side-by-side");
  const [swipe, setSwipe] = useState(50);
  const [sides, setSides] = useState<{ old: ImageSide | null; new: ImageSide | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      try {
        const [oldSide, newSide] = await Promise.all([
          loadSide(path, "old"),
          loadSide(path, "new"),
        ]);
        if (!cancelled) setSides({ old: oldSide, new: newSide });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const both = sides?.old != null && sides.new != null;
  const activeMode = both ? mode : "side-by-side";
  const oldUrl = useMemo(() => toDataUrl(sides?.old ?? null), [sides?.old]);
  const newUrl = useMemo(() => toDataUrl(sides?.new ?? null), [sides?.new]);

  if (error != null)
    return (
      <div role="alert" className="p-4 text-xs text-destructive">
        {error}
      </div>
    );
  if (sides == null)
    return (
      <output aria-busy="true" className="block p-4 text-xs text-muted-foreground">
        Loading image comparison…
      </output>
    );
  if (sides.old == null && sides.new == null)
    return (
      <div role="note" className="p-4 text-xs text-muted-foreground">
        Neither image side is available.
      </div>
    );

  return (
    <section aria-label={`Image diff for ${path}`} className="space-y-3 p-3">
      {both ? (
        <div
          className="app-image-mode-switch inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/45 p-0.5"
          role="group"
          aria-label="Image comparison mode"
        >
          <ModeButton
            active={activeMode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
            icon={<Columns2 />}
            label="Side by side"
          >
            Split
          </ModeButton>
          <ModeButton
            active={activeMode === "overlay"}
            onClick={() => setMode("overlay")}
            icon={<Layers3 />}
            label="Overlay"
          >
            Overlay
          </ModeButton>
          <ModeButton
            active={activeMode === "swipe"}
            onClick={() => setMode("swipe")}
            icon={<PanelLeftClose />}
            label="Swipe"
          >
            Swipe
          </ModeButton>
        </div>
      ) : null}
      {activeMode === "side-by-side" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ImagePanel label="Before" side={sides.old} url={oldUrl} />
          <ImagePanel label="After" side={sides.new} url={newUrl} />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-2">
          <div className="relative grid min-h-48 place-items-center overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(oklch(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
            <img
              src={oldUrl ?? ""}
              alt="Before"
              className="max-h-[60vh] max-w-full object-contain"
            />
            <div
              className="absolute inset-0 grid place-items-center overflow-hidden"
              style={
                activeMode === "swipe"
                  ? { clipPath: `inset(0 ${100 - swipe}% 0 0)` }
                  : { opacity: swipe / 100 }
              }
            >
              <img
                src={newUrl ?? ""}
                alt="After"
                className="max-h-[60vh] max-w-full object-contain"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {activeMode === "swipe" ? "Reveal" : "After opacity"}
            <input
              aria-label={activeMode === "swipe" ? "Swipe reveal percentage" : "Overlay opacity"}
              type="range"
              min="0"
              max="100"
              value={swipe}
              onChange={(event) => setSwipe(Number(event.target.value))}
              className="flex-1"
            />
            <span className="w-9 font-mono">{swipe}%</span>
          </label>
        </div>
      )}
    </section>
  );
}

function ModeButton({
  active,
  children,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "h-7 gap-1.5 rounded-[0.3rem] px-2 text-[11px] font-medium shadow-none [&_svg]:size-3.5",
        active
          ? "bg-card text-foreground shadow-sm hover:bg-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </Button>
  );
}

function ImagePanel({
  label,
  side,
  url,
}: {
  label: string;
  side: ImageSide | null;
  url: string | null;
}) {
  const [dimensions, setDimensions] = useState("—");
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-muted/30">
      <figcaption className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs font-medium">
        {label}
        <span className="font-mono text-[10px] text-muted-foreground">
          {side == null
            ? "missing"
            : `${dimensions} · ${formatBytes(side.bytes)} · ${side.mimeType}`}
        </span>
      </figcaption>
      <div className="grid min-h-40 place-items-center p-2">
        {side == null || url == null ? (
          <span className="text-xs text-muted-foreground">No {label.toLowerCase()} image</span>
        ) : (
          <img
            src={url}
            alt={`${label} version`}
            onLoad={(event) =>
              setDimensions(
                `${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`,
              )
            }
            className="max-h-[55vh] max-w-full object-contain"
          />
        )}
      </div>
    </figure>
  );
}

async function loadSide(path: string, side: "old" | "new"): Promise<ImageSide | null> {
  try {
    return await fetchJson<ImageSide>(`/api/image?${new URLSearchParams({ path, side })}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) return null;
    throw error;
  }
}

function toDataUrl(side: ImageSide | null): string | null {
  return side == null ? null : `data:${side.mimeType};base64,${side.data}`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
