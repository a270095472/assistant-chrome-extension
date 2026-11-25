import { PLATFORMS } from './catalog.js';

/** 純函式：只處理網址字串，沒有 Chrome、網路或 DOM 副作用。 */
export function detectPlatform(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  // 只接受標準 HTTPS，不接受使用者資訊、非標準埠或擴充套件等協定。
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  for (const platform of PLATFORMS) {
    const site = platform.sites.find((candidate) =>
      url.hostname === candidate.host &&
      (!candidate.path || candidate.path === '/' || url.pathname === candidate.path ||
        url.pathname.startsWith(`${candidate.path}/`)));
    if (site) return { platformId: platform.id, branch: site.branch ?? null };
  }
  return null;
}
