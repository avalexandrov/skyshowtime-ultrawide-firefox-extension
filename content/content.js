(() => {
  "use strict";

  const MODE = Object.freeze({
    ORIGINAL: "original",
    FILL: "fill",
  });
  const TITLE_PREFERENCES_KEY = "titleModes";
  const MAX_SAVED_TITLES = 200;
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
  const GENERIC_ROUTE_SEGMENTS = new Set([
    "",
    "account",
    "home",
    "login",
    "my-list",
    "profiles",
    "search",
    "settings",
    "signin",
  ]);
  const TITLE_ROUTE_SEGMENTS = new Set([
    "content",
    "details",
    "episode",
    "movie",
    "play",
    "programme",
    "program",
    "series",
    "show",
    "title",
    "video",
    "watch",
  ]);

  let mode = MODE.ORIGINAL;
  let activeVideo = null;
  let activeTitleKey = null;
  let managedVideo = null;
  let lifecycleVideo = null;
  let scheduledCheck = false;
  let titleModes = {};
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

  /**
   * Builds a conservative persistence key from a title-specific SkyShowtime
   * route. Generic routes, such as Home and Search, deliberately have no key:
   * reusing a Fill preference there could crop a different programme.
   */
  function currentTitleKey() {
    const url = new URL(window.location.href);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const segments = pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.toLowerCase());
    const lastSegment = segments.at(-1) ?? "";
    const hasTitleRouteSegment = segments.some((segment) => TITLE_ROUTE_SEGMENTS.has(segment));
    const hasIdentifier = segments.some((segment) => /\d/.test(segment));

    if (
      GENERIC_ROUTE_SEGMENTS.has(lastSegment) ||
      (!hasTitleRouteSegment && !hasIdentifier)
    ) {
      return null;
    }

    return `route:${url.origin}${pathname}`;
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

    // A reused element that empties its media is no longer clearly the same
    // playback. Keep Original until a changed title route or new element gives
    // us a safe identity for a remembered preference.
    restoreManagedVideo();
    mode = MODE.ORIGINAL;
    scheduleReconcile();
  }

  function watchVideoLifecycle(video) {
    if (video === lifecycleVideo) {
      return;
    }

    lifecycleVideo?.removeEventListener("emptied", resetForNewPlayback);
    lifecycleVideo = video;
    lifecycleVideo?.addEventListener("emptied", resetForNewPlayback);
  }

  function resetForPlaybackChange(video, titleKey) {
    if (video === activeVideo && titleKey === activeTitleKey) {
      return false;
    }

    restoreManagedVideo();
    activeVideo = video;
    activeTitleKey = titleKey;
    mode = MODE.ORIGINAL;
    watchVideoLifecycle(video);

    // Fill is restored only for an exact route that the user previously chose.
    if (video && titleKey && titleModes[titleKey] === MODE.FILL) {
      applyFill(video);
      mode = MODE.FILL;
    }

    return true;
  }

  function reconcilePlayer() {
    const video = findActiveVideo();
    const titleKey = currentTitleKey();
    const identityChanged = resetForPlaybackChange(video, titleKey);

    // Keep Fill through harmless updates to the same current video element.
    if (!identityChanged && mode === MODE.FILL && video && managedVideo === video && !isExtensionObjectFit(video)) {
      applyFill(video);
    }

    return video;
  }

  function playbackState(applied = mode === MODE.FILL) {
    return {
      mode,
      hasVideo: Boolean(activeVideo),
      applied,
      titleMemoryAvailable: Boolean(activeTitleKey),
      remembered: Boolean(activeTitleKey && titleModes[activeTitleKey] === MODE.FILL),
    };
  }

  async function saveTitleMode(nextMode) {
    if (!activeTitleKey) {
      return false;
    }

    const nextTitleModes = { ...titleModes };
    delete nextTitleModes[activeTitleKey];

    if (nextMode === MODE.FILL) {
      const keys = Object.keys(nextTitleModes);
      while (keys.length >= MAX_SAVED_TITLES) {
        delete nextTitleModes[keys.shift()];
      }
      nextTitleModes[activeTitleKey] = MODE.FILL;
    }

    try {
      await browser.storage.local.set({ [TITLE_PREFERENCES_KEY]: nextTitleModes });
      titleModes = nextTitleModes;
      return true;
    } catch (error) {
      console.warn("SkyShowtime Ultrawide could not save the title preference:", error);
      return false;
    }
  }

  async function setPlaybackMode(nextMode) {
    const video = reconcilePlayer();

    if (nextMode !== MODE.FILL) {
      restoreManagedVideo();
      mode = MODE.ORIGINAL;
      await saveTitleMode(MODE.ORIGINAL);
      return playbackState(false);
    }

    if (!video) {
      mode = MODE.ORIGINAL;
      return playbackState(false);
    }

    applyFill(video);
    mode = MODE.FILL;
    await saveTitleMode(MODE.FILL);
    return playbackState(true);
  }

  async function togglePlaybackMode() {
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

  async function loadTitleModes() {
    try {
      const stored = await browser.storage.local.get({ [TITLE_PREFERENCES_KEY]: {} });
      const savedModes = stored[TITLE_PREFERENCES_KEY];

      if (!savedModes || typeof savedModes !== "object" || Array.isArray(savedModes)) {
        return;
      }

      titleModes = Object.fromEntries(
        Object.entries(savedModes).filter(
          ([key, savedMode]) => typeof key === "string" && savedMode === MODE.FILL,
        ),
      );
    } catch (error) {
      console.warn("SkyShowtime Ultrawide could not load title preferences:", error);
    }
  }

  const titleModesReady = loadTitleModes();

  browser.runtime.onMessage.addListener(async (message) => {
    await titleModesReady;

    switch (message?.type) {
      case "getPlaybackState":
        reconcilePlayer();
        return playbackState();
      case "setPlaybackMode":
        return setPlaybackMode(message.mode);
      case "togglePlaybackMode":
        return togglePlaybackMode();
      default:
        return undefined;
    }
  });

  async function initialize() {
    await titleModesReady;
    watchForPlayerChanges();
    reconcilePlayer();
  }

  initialize().catch((error) => {
    console.warn("SkyShowtime Ultrawide could not initialize:", error);
  });
})();
