"use strict";

const MODE = Object.freeze({
  ORIGINAL: "original",
  FILL: "fill",
});

const modeOptions = [...document.querySelectorAll('input[name="mode"]')];
const status = document.querySelector("#status");

function setStatus(message, isWarning = false) {
  status.textContent = message;
  status.classList.toggle("is-warning", isWarning);
}

function renderState(playback) {
  const mode = playback?.mode === MODE.FILL ? MODE.FILL : MODE.ORIGINAL;
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
}

async function sendToActiveTab(message) {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    return { unavailable: true };
  }

  try {
    return await browser.tabs.sendMessage(tab.id, message);
  } catch (_error) {
    // The content script is deliberately unavailable outside SkyShowtime.
    return { unavailable: true };
  }
}

function describeState(playback) {
  if (!playback.hasVideo) {
    return ["Start a SkyShowtime video to use Fill Ultrawide.", false];
  }

  return playback.mode === MODE.FILL
    ? ["Fill Ultrawide is active for this video.", false]
    : ["Original sizing is active for this video.", false];
}

async function refreshState() {
  const playback = await sendToActiveTab({ type: "getPlaybackState" });
  if (playback?.unavailable) {
    renderState({ mode: MODE.ORIGINAL });
    setStatus("Open SkyShowtime to control the current video.", true);
    return;
  }

  renderState(playback);
  setStatus(...describeState(playback));
}

async function applySelectedMode() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const playback = await sendToActiveTab({ type: "setPlaybackMode", mode });

  if (playback?.unavailable) {
    renderState({ mode: MODE.ORIGINAL });
    setStatus("Open SkyShowtime to control the current video.", true);
    return;
  }

  renderState(playback);
  setStatus(...describeState(playback));
}

modeOptions.forEach((option) => option.addEventListener("change", applySelectedMode));

refreshState().catch((error) => {
  console.error("SkyShowtime Ultrawide popup could not read the player:", error);
  renderState({ mode: MODE.ORIGINAL });
  setStatus("Could not read the current playback state.", true);
});
