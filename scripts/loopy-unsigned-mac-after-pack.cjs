const { execFileSync } = require("node:child_process");
const path = require("node:path");
const prepareServerCompileCache = require("./prepare-server-compile-cache.cjs");

// Without a signature over the whole bundle, Gatekeeper calls a downloaded
// unsigned app "damaged" instead of offering right-click → Open. electron-builder
// skips afterSign when nothing was signed, so the ad-hoc signature goes here,
// after the compile cache lands in Resources and before the DMG and ZIP exist.
module.exports = async (context) => {
  await prepareServerCompileCache(context);
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
