import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { renderOgCard } from "./opengraph-image";

// Twitter card reuses the same branded, repo-agnostic card (COA-126). The
// route config must be declared literally here — Next statically parses it and
// can't follow a re-export — so only the render function is shared.
export const runtime = "edge";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgCard();
}
