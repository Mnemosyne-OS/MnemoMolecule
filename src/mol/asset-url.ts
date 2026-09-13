/**
 * Where a corpus file actually lives, under both of the two shells this page runs in.
 *
 * Under `pnpm dev` the page is served from a web root, so `fetch('/corpus/index.json')`
 * would be correct. An INSTALLED cartridge is served from
 * `mnemo-plugin://app/<plugin-id>/index.html`, where that same root-absolute path
 * resolves to `mnemo-plugin://app/corpus/index.json` — a URL whose first segment
 * matches no installed plugin id, so the host's protocol handler returns 404 and
 * the page reports that the structure catalogue could not be loaded. Resolving
 * against `document.baseURI` instead is correct in both.
 *
 * Vite's `base: './'` rewrites only the URLs it can SEE at build time. Every
 * corpus URL is built at runtime — one literal for the index, and one per
 * structure out of the index itself — so all of them come through here.
 *
 * (Atlas learned this on its two runtime fetches. It is written out again
 * rather than imported because a cartridge ships alone.)
 */
export function assetUrl(path: string): string {
  // A caller may already hold an absolute URL (http:, blob:, data:). Leave it
  // alone rather than mangling it into the cartridge's own origin.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), document.baseURI).toString();
}
