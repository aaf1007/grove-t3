# Loopy macOS release

`.github/workflows/loopy-release.yml` builds Loopy for Apple Silicon and Intel Macs on GitHub-hosted runners. A `vX.Y.Z` tag produces a **draft** release; a manual run is an unsigned dry run. Tag builds are ad-hoc signed: users open them the first time with right-click → Open, and installed apps cannot auto-update, because macOS only applies updates whose signature matches a real developer identity. Set the repository variable `LOOPY_SIGNED_RELEASES` to `true` to sign and notarize tag builds instead. Upstream's `release.yml` and the workflows it calls stay disabled in this repository's Actions settings. Leave those files unedited so upstream merges stay clean.

## Signing setup

Only needed for `LOOPY_SIGNED_RELEASES`. In the Apple Developer site, as the team's Account Holder or Admin:

1. **Developer ID Application certificate.** Create it under Certificates (it needs a CSR from Keychain Access), install it, then export it from Keychain Access with its private key as a password-protected `.p12`.
2. **Notarization key.** In App Store Connect → Users and Access → Integrations → App Store Connect API, create a team key with the Developer role. Download the `.p8` (Apple offers it once) and note its Key ID and the Issuer ID.
3. **Team ID.** Shown under Membership details.

Loopy needs no App ID, provisioning profile, or Associated Domains. Those are only for Clerk passkeys; without Clerk the build signs with Developer ID alone.

In GitHub → Settings → Secrets and variables → Actions:

| Name               | Kind     | Value                                                                  |
| ------------------ | -------- | ---------------------------------------------------------------------- |
| `CSC_LINK`         | secret   | the `.p12`, base64: `base64 -i cert.p12 \| gh secret set CSC_LINK`     |
| `CSC_KEY_PASSWORD` | secret   | the `.p12` password                                                    |
| `APPLE_API_KEY`    | secret   | the `.p8` file's text: `gh secret set APPLE_API_KEY < AuthKey_XXXX.p8` |
| `APPLE_API_KEY_ID` | secret   | the key's Key ID                                                       |
| `APPLE_API_ISSUER` | secret   | the Issuer ID                                                          |
| `APPLE_TEAM_ID`    | variable | the 10-character Team ID                                               |

With `LOOPY_SIGNED_RELEASES` set, a tag build stops in Preflight and names whatever is missing. The workflow also checks that the app is signed by `APPLE_TEAM_ID`, so a wrong certificate fails the build.

Do not set Clerk or relay values (`T3CODE_CLERK_*`, `T3CODE_RELAY_URL`). Loopy has no T3 Connect, and the build fails if the bundle contains the T3 values from `.env.example`.

## Dry run

Actions → **Loopy Release** → Run workflow. It builds both architectures unsigned as `<package version>-dryrun.<run number>`, merges the updater manifest, and uploads the `desktop-mac-arm64`, `desktop-mac-x64` and `updater-manifest` artifacts. It creates no tag or release. Unsigned apps open only with right-click → Open.

## Cut a release

1. Choose a version higher than every published Loopy release; installed apps only update to a higher version. The tag sets the version, whatever the repository's `package.json` files say.
2. Tag and push: `git tag v0.2.0 origin/main && git push origin v0.2.0`.
3. The workflow creates the draft **Loopy v0.2.0** with both DMGs and ZIPs, their blockmaps, and one `latest-mac.yml` that lists both architectures. A tag with a suffix (`v0.2.0-beta.1`) makes a prerelease, which installed apps never update to.

## Test the draft, then publish

Installed apps cannot see a draft, so testing it is safe.

1. Download the DMG for your Mac, install it, and launch it. An ad-hoc signed app opens with right-click → Open. A notarized app opens without a Gatekeeper warning; `spctl -a -vv` on the installed app reports `source=Notarized Developer ID`.
2. The Intel build is never launched in CI. On Apple Silicon it runs under Rosetta, so install the x64 DMG once too.
3. Open `latest-mac.yml` from the draft and check that it lists an `arm64` and an `x64` ZIP.
4. Publish the draft with **Set as the latest release** checked. Installed apps find it on their next update check. From the second release on, keep the previous version installed and check that it updates.

To retry a failed or bad release, delete the draft and its tag (`git push origin :refs/tags/v0.2.0`), fix the problem, and tag again.
