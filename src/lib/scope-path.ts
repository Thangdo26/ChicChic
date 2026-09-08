// Thuần, dùng chung ở edge và server. Header chỉ phục vụ routing, không cấp quyền.
export const REQUEST_PATH_HEADER = "x-chic-request-path";
export function isChildPath(path: string): boolean {
  return path === "/be" || path.startsWith("/be/");
}
export function childPathAllowed(path: string, childId: string): boolean {
  const root = `/be/${encodeURIComponent(childId)}`;
  if (path === root || path === `${root}/mong-muon` || path === `${root}/nhat-ky`) return true;
  return path.startsWith(`${root}/khoanh-khac/`) && /^[a-zA-Z0-9_-]+$/.test(path.slice(`${root}/khoanh-khac/`.length));
}
