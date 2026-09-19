# AMO listing draft

## Store details

- **Name:** SkyShowtime Ultrawide
- **Summary:** Manually fill cinematic SkyShowtime video on ultrawide displays, with a remembered choice for each title.
- **Category:** Appearance
- **Homepage and support:** https://github.com/avalexandrov/skyshowtime-ultrawide-firefox-extension
- **License:** MIT
- **Distribution:** Firefox desktop only

## Description

SkyShowtime Ultrawide adds an optional **Fill Ultrawide** mode to SkyShowtime video playback on ultrawide displays.

SkyShowtime sometimes delivers a cinematic movie inside a 16:9 video stream with encoded black bars. When you choose Fill Ultrawide, the extension applies `object-fit: cover` to the video element only, removing the outer bars and filling the player. It does not resize the player container, subtitles, or controls.

The extension always starts a new title in **Original** mode. This is deliberate: browsers cannot reliably distinguish a letterboxed cinematic stream from genuine 16:9 content, and automatically filling every video could crop genuine 16:9 programmes.

Choose Fill Ultrawide from the toolbar popup or press **Alt+Shift+U** on Windows/Linux or **Command+Shift+U** on macOS. A Fill choice is stored locally for the title's SkyShowtime route and restored only when returning to that same title. Choosing Original clears that saved choice.

## Privacy disclosure

The extension makes no network requests, sends no data to any server, uses no analytics or telemetry, and loads no remote code. It stores only local Fill Ultrawide preferences keyed by SkyShowtime title routes. It does not inspect frames, access video sources, interact with DRM, or intercept network traffic.

## Reviewer notes

- **Purpose:** The extension modifies only the computed `object-fit` style of the active `<video>` element on `https://*.skyshowtime.com/*`.
- **Permissions:** `storage` is used only for local per-title Fill preferences.
- **Test steps:**
  1. Install the extension in Firefox desktop.
  2. Open SkyShowtime and start a video.
  3. Open the toolbar popup and select Fill Ultrawide, or press the listed keyboard shortcut.
  4. Confirm that only the video is changed; captions and player controls are unaffected.
  5. Return to Original, then open another title to confirm its default is Original.
- **Account requirement:** Playback needs a SkyShowtime subscription. No test credentials are included because this extension has no service account or backend. Reviewers can inspect the self-contained, readable source and validate the popup and command behavior without any network or DRM interaction.
- **Build/source:** The uploaded package is the readable source itself; there is no transpilation, minification, generated code, or external dependency.

## Before submitting

1. Add at least one truthful screenshot of the popup in Firefox to the AMO listing.
2. Confirm that the AMO account's support contact and author details are correct.
3. Confirm the MIT license and permanent add-on ID before the first upload. Do not change the ID in later versions.
