"use strict";

const TOGGLE_COMMAND = "toggle-ultrawide";

browser.commands.onCommand.addListener(async (command, commandTab) => {
  if (command !== TOGGLE_COMMAND) {
    return;
  }

  try {
    const tab = commandTab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { type: "togglePlaybackMode" });
    }
  } catch (_error) {
    // The command is intentionally a no-op when the active tab is not SkyShowtime.
  }
});
