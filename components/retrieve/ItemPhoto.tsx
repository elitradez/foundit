import { categoryByKey, isSensitiveCategory, type CategoryKey } from "@/lib/retrieve/config";
import { T } from "@/lib/retrieve/tokens";

/** Deterministic gradient per category for placeholder "photos" (no binaries needed). */
const GRADIENTS: Record<CategoryKey, [string, string]> = {
  phone: ["#3A3F4B", "#1B1E26"],
  wallet: ["#7A5C3E", "#4A3826"],
  id: ["#3E5A7A", "#26384A"],
  keys: ["#8A7A3E", "#4A4226"],
  headphones: ["#4B4B5A", "#26262E"],
  electronics: ["#3E6A6A", "#264242"],
  bottle: ["#3E7A5C", "#264A38"],
  clothing: ["#6A4B7A", "#42264A"],
  bag: ["#7A4B4B", "#4A2626"],
  jewelry: ["#7A6A3E", "#4A4026"],
  eyewear: ["#4B5A6A", "#262E38"],
  other: ["#5A5A5A", "#2E2E2E"],
};

/**
 * Item photo surface. Renders a captured data-URL photo when present, otherwise
 * a branded gradient placeholder with the category icon.
 *
 * Sensitive categories (ID / wallet / phone) are blurred by default with a
 * "Protected" overlay, unless `reveal` is set (e.g. staff-side views).
 */
export function ItemPhoto({
  category,
  photo,
  aspectRatio = "4 / 3",
  reveal = false,
  rounded = 0,
}: {
  category: CategoryKey;
  photo: string | null;
  aspectRatio?: string;
  reveal?: boolean;
  rounded?: number;
}) {
  const cat = categoryByKey(category);
  const [g1, g2] = GRADIENTS[category] ?? GRADIENTS.other;
  // Sensitive items (ID / wallet / phone) are never shown to non-staff. We do
  // not request the photo at all in that case — the server route would 403
  // anyway, but this avoids the request and any broken-image flash. Real
  // enforcement is server-side; this is just the matching UI.
  const sensitiveHidden = isSensitiveCategory(category) && !reveal;
  const showImage = !!photo && !sensitiveHidden;
  // Non-sensitive photos get a slight blur in the member view so the exact item
  // isn't fully legible until a claim is made. Staff (reveal) always see sharp,
  // and sensitive items are hidden entirely above — so this only ever applies to
  // a member viewing a non-sensitive photo. The small scale hides the
  // translucent edges blur would otherwise reveal against the background.
  const memberBlur = showImage && !reveal;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio,
        background: showImage ? "#000" : `linear-gradient(135deg, ${g1}, ${g2})`,
        overflow: "hidden",
        borderRadius: rounded,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo!}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // iOS Safari (WebKit) frequently won't paint `filter: blur()` on an
            // <img> unless the element is forced onto its own GPU compositing
            // layer — a 2D `scale()` alone doesn't promote it (Safari applies the
            // scale but drops the blur). `translateZ(0)` forces the layer; the
            // -webkit-filter alias covers older WebKit, and will-change hints it.
            filter: memberBlur ? "blur(4px)" : undefined,
            WebkitFilter: memberBlur ? "blur(4px)" : undefined,
            transform: memberBlur ? "scale(1.06) translateZ(0)" : undefined,
            willChange: memberBlur ? "filter" : undefined,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            userSelect: "none",
          }}
        >
          {cat.icon}
        </div>
      )}

      {sensitiveHidden ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            background: "rgba(18,18,18,0.28)",
            color: T.heroForeground,
          }}
        >
          <span aria-hidden style={{ fontSize: 18 }}>🔒</span>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>Protected</span>
        </div>
      ) : null}
    </div>
  );
}
