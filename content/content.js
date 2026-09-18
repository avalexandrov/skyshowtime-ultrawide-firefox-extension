(() => {
  "use strict";

  const MODE = Object.freeze({
    ORIGINAL: "original",
    FILL: "fill",
  });
  const VIDEO_SELECTORS = [
    '[data-gsp-video-component="true"] > video',
    "#core-video-shaka",
    '[data-testid="video-component"] video',
  ];
  const PLAYER_MARKER_SELECTOR = [
    "video",
    '[data-gsp-video-component="true"]',
    '[data-testid="video-component"]',
  ].join(", ");

  let mode = MODE.ORIGINAL;
  let activeVideo = null;
  let managedVideo = null;
  let lifecycleVideo = null;
  let scheduledCheck = false;
  const originalObjectFits = new WeakMap();

  /**
   * Finds SkyShowtime's video element without depending on generated CSS classes.
   * The selector order reflects the most specific, stable player markers first.
   */
  function findActiveVideo() {
    for (const selector of VIDEO_SELECTORS) {
      const video = document.querySelector(selector);
      if (video instanceof HTMLVideoElement) {
        return video;
      }
    }

    return null;
  }

  function isExtensionObjectFit(video) {
    return (
      video.style.getPropertyValue("object-fit").trim() === "cover" &&
      video.style.getPropertyPriority("object-fit") === "important"
    );
  }

  function applyFill(video) {
    const savedStyle = originalObjectFits.get(video);

    // If the page changed object-fit since we last managed this same video,
    // save that new page value before applying ours again.
    if (!savedStyle || !isExtensionObjectFit(video)) {
      originalObjectFits.set(video, {
        value: video.style.getPropertyValue("object-fit"),
        priority: video.style.getPropertyPriority("object-fit"),
      });
    }

    video.style.setProperty("object-fit", "cover", "important");
    managedVideo = video;
  }

  function restoreOriginal(video) {
    const savedStyle = originalObjectFits.get(video);
    if (!savedStyle) {
      return;
    }

    // Do not overwrite an object-fit value SkyShowtime applied after ours.
    if (isExtensionObjectFit(video)) {
      if (savedStyle.value) {
        video.style.setProperty("object-fit", savedStyle.value, savedStyle.priority);
      } else {
        video.style.removeProperty("object-fit");
      }
    }

    originalObjectFits.delete(video);
    if (managedVideo === video) {
      managedVideo = null;
    }
  }

  function restoreManagedVideo() {
    if (managedVideo) {
      restoreOriginal(managedVideo);
    }
  }

  function resetForNewPlayback(event) {
    if (event.currentTarget !== activeVideo) {
      return;
    }

    // SkyShowtime may reuse a video element while replacing its media source.
    // An emptied player is not clearly the same playback, so choose safety over
    // keeping a crop that might be wrong for the next title.
    restoreManagedVideo();
    mode = MODE.ORIGINAL;
  }

  function watchVideoLifecycle(video) {
    if (video === lifecycleVideo) {
      return;
    }

    lifecycleVideo?.removeEventListener("emptied", resetForNewPlayback);
    lifecycleVideo = video;
    lifecycleVideo?.addEventListener("emptied", resetForNewPlayback);
  }

  function resetForPlayerChange(video) {
    if (video === activeVideo) {
      return;
    }

    // A different element is treated as a different playback instance. Never
    // carry Fill Ultrawide to it, even during SkyShowtime SPA navigation.
    restoreManagedVideo();
    activeVideo = video;
    mode = MODE.ORIGINAL;
    watchVideoLifecycle(video);
  }

  function reconcilePlayer() {
    const video = findActiveVideo();
    resetForPlayerChange(video);

    // We retain Fill only when the exact same video element survives a player
    // update. This lets the current playback recover without enabling Fill on
    // a newly mounted episode or movie.
    if (mode === MODE.FILL && video && managedVideo === video && !isExtensionObjectFit(video)) {
      applyFill(video);
    }

    return video;
  }

  function playbackState(applied = mode === MODE.FILL) {
    return {
      mode,
      hasVideo: Boolean(activeVideo),
      applied,
    };
  }

  function setPlaybackMode(nextMode) {
    const video = reconcilePlayer();

    if (nextMode !== MODE.FILL) {
      restoreManagedVideo();
      mode = MODE.ORIGINAL;
      return playbackState(false);
    }

    if (!video) {
      mode = MODE.ORIGINAL;
      return playbackState(false);
    }

    applyFill(video);
    mode = MODE.FILL;
    return playbackState(true);
  }

  function togglePlaybackMode() {
    reconcilePlayer();
    return setPlaybackMode(mode === MODE.FILL ? MODE.ORIGINAL : MODE.FILL);
  }

  function scheduleReconcile() {
    if (scheduledCheck) {
      return;
    }

    scheduledCheck = true;
    requestAnimationFrame(() => {
      scheduledCheck = false;
      reconcilePlayer();
    });
  }

  function nodeCouldContainPlayer(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    return (
      node.matches(PLAYER_MARKER_SELECTOR) ||
      Boolean(node.querySelector(PLAYER_MARKER_SELECTOR))
    );
  }

  function mutationsCouldAffectPlayer(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type === "attributes") {
        return nodeCouldContainPlayer(mutation.target);
      }

      for (const node of mutation.addedNodes) {
        if (nodeCouldContainPlayer(node)) {
          return true;
        }
      }

      for (const node of mutation.removedNodes) {
        if (node === activeVideo || node === managedVideo || nodeCouldContainPlayer(node)) {
          return true;
        }
      }

      return false;
    });
  }

  function watchForPlayerChanges() {
    const observer = new MutationObserver((mutations) => {
      if (mutationsCouldAffectPlayer(mutations)) {
        scheduleReconcile();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "data-gsp-video-component", "data-testid", "style"],
    });
  }

  browser.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case "getPlaybackState":
        reconcilePlayer();
        return Promise.resolve(playbackState());
      case "setPlaybackMode":
        return Promise.resolve(setPlaybackMode(message.mode));
      case "togglePlaybackMode":
        return Promise.resolve(togglePlaybackMode());
      default:
        return undefined;
    }
  });

  watchForPlayerChanges();
  reconcilePlayer();
})();
