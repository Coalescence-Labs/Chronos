/**
 * AI integration point — intentionally empty.
 *
 * Both the feature surface (decision #4) and the ZDR provider (decision #5)
 * are OPEN — see docs/ARCHITECTURE.md. Any code added here must first clear
 * the privacy pre-flight (.claude/skills/privacy-preflight/) and respect
 * docs/PRIVACY.md: opt-in only, ZDR verified in writing, minimum context.
 */

export const AI_FEATURES_ENABLED = false;
