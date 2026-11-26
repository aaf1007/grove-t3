/** macOS vibrancy works everywhere; Electron's acrylic needs Windows 11 22H2 (build 22621). */
export function supportsSidebarTranslucency(
  platform: NodeJS.Platform,
  systemVersion: string,
): boolean {
  if (platform === "darwin") return true;
  return platform === "win32" && Number(systemVersion.split(".")[2]) >= 22621;
}
