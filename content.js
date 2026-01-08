// ========================
// Constants & Utilities
// ========================

const YT_TS_STORAGE_KEY_PREFIX = "yt_timestamper_";
const YT_TS_GLOBAL_SETTINGS_KEY = "yt_timestamper_settings";

// Global settings default
const DEFAULT_SETTINGS = {
  autoPlayOnJump: false,
  // "timestamps_only" | "title_url_and_timestamps_with_links"
  copyMode: "timestamps_only"
};

// Get YouTube video ID
function getYouTubeVideoId() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("v");
  } catch (e) {
    return null;
  }
}

// Base video URL
function getVideoUrl() {
  const videoId = getYouTubeVideoId();
  if (!videoId) return window.location.href;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// URL with timestamp
function getTimestampUrl(seconds) {
  const base = getVideoUrl();
  const t = Math.floor(seconds);
  return `${base}&t=${t}s`;
}

// Video title
function getVideoTitle() {
  const cand =
    document.querySelector("h1.title yt-formatted-string") ||
    document.querySelector("h1.ytd-video-primary-info-renderer") ||
    document.querySelector("h1");
  return cand ? cand.textContent.trim() : "";
}

// seconds -> "m:ss" or "h:mm:ss"
function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Get <video> element
function getYoutubeVideoElement() {
  let video = document.querySelector("video");
  if (
    !video ||
    typeof video.currentTime !== "number" ||
    isNaN(video.currentTime)
  ) {
    const candidates = document.querySelectorAll("video");
    if (candidates.length > 0) {
      video = candidates[0];
    }
  }
  return video;
}

// ========================
// Storage helpers
// ========================

// state: { entries, order, loop }
function loadState(videoId) {
  return new Promise((resolve) => {
    if (!videoId || !chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }
    const key = YT_TS_STORAGE_KEY_PREFIX + videoId;
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || null);
    });
  });
}

function saveState(videoId, state) {
  // Only persist entries + order; loop is runtime-only
  const toSave = {
    entries: state.entries,
    order: state.order
  };
  return new Promise((resolve) => {
    if (!videoId || !chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }
    const key = YT_TS_STORAGE_KEY_PREFIX + videoId;
    chrome.storage.local.set({ [key]: toSave }, () => resolve());
  });
}

// Global settings
function loadGlobalSettings() {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve({ ...DEFAULT_SETTINGS });
      return;
    }
    chrome.storage.local.get([YT_TS_GLOBAL_SETTINGS_KEY], (result) => {
      const stored = result[YT_TS_GLOBAL_SETTINGS_KEY];
      if (!stored) {
        resolve({ ...DEFAULT_SETTINGS });
      } else {
        resolve({ ...DEFAULT_SETTINGS, ...stored });
      }
    });
  });
}

function saveGlobalSettings(settings) {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }
    const toSave = { ...DEFAULT_SETTINGS, ...settings };
    chrome.storage.local.set(
      { [YT_TS_GLOBAL_SETTINGS_KEY]: toSave },
      () => resolve()
    );
  });
}

// ========================
// UI creation
// ========================

function createPanelRoot() {
  const panel = document.createElement("div");
  panel.className = "yt-timestamper-panel";

  panel.innerHTML = `
    <div class="yt-timestamper-header">
      <div class="yt-timestamper-title">Timestamp Helper</div>
      <div class="yt-timestamper-header-right">
        <button
          class="yt-timestamper-toggle-btn"
          id="yt-timestamper-toggle-btn"
          title="Open / Close"
        >
          ▾
        </button>
        <button
          class="yt-timestamper-gear-btn"
          id="yt-timestamper-gear-btn"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>

    <div class="yt-timestamper-body" id="yt-timestamper-body">
      <div class="yt-timestamper-input-row">
        <input
          type="text"
          id="yt-timestamper-input"
          class="yt-timestamper-input"
          placeholder="Label (e.g. Intro / Verse / Chorus)"
        />
        <button id="yt-timestamper-add-btn" class="yt-timestamper-add-btn">
          Add
        </button>
      </div>

      <div id="yt-timestamper-list" class="yt-timestamper-list">
        <div class="yt-timestamper-list-empty">
          No timestamps yet
        </div>
      </div>

      <div class="yt-timestamper-footer">
        <button id="yt-timestamper-copy-btn" class="yt-timestamper-copy-btn">
          Copy
        </button>
      </div>

      <!-- Inline toast (under Copy button) -->
      <div
        id="yt-timestamper-inline-toast"
        class="yt-timestamper-inline-toast"
        style="display:none;"
      ></div>
    </div>

    <div id="yt-timestamper-settings-overlay" class="yt-timestamper-settings-overlay" style="display:none;">
      <div class="yt-timestamper-settings-modal">
        <div class="yt-timestamper-settings-header">
          <div class="yt-timestamper-settings-title">Settings</div>
        </div>
        <div class="yt-timestamper-settings-body">
          <div class="yt-timestamper-settings-section">
            <div class="yt-timestamper-settings-section-title">After jumping</div>
            <label class="yt-timestamper-radio-label">
              <input type="radio" name="yt_ts_autoplay" value="true" />
              Play
            </label>
            <label class="yt-timestamper-radio-label">
              <input type="radio" name="yt_ts_autoplay" value="false" />
              Pause
            </label>
          </div>

          <div class="yt-timestamper-settings-section">
            <div class="yt-timestamper-settings-section-title">Copy format</div>
            <label class="yt-timestamper-radio-label">
              <input type="radio" name="yt_ts_copymode" value="timestamps_only" />
              Timestamps only
            </label>
            <label class="yt-timestamper-radio-label">
              <input
                type="radio"
                name="yt_ts_copymode"
                value="title_url_and_timestamps_with_links"
              />
              Title + URL + timestamps with links
            </label>
          </div>
        </div>
        <div class="yt-timestamper-settings-footer">
          <button id="yt-timestamper-settings-cancel" class="yt-timestamper-settings-btn secondary">
            Cancel
          </button>
          <button id="yt-timestamper-settings-save" class="yt-timestamper-settings-btn primary">
            Save
          </button>
        </div>
      </div>
    </div>
  `;

  return panel;
}

// ========================
// Inline toast
// ========================

function showInlineToast(el, message, type = "success", timeout = 1800) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("success", "error");
  el.classList.add(type);
  el.style.display = "flex";

  if (el._hideTimer) {
    clearTimeout(el._hideTimer);
  }
  el._hideTimer = setTimeout(() => {
    el.style.display = "none";
  }, timeout);
}

// ========================
// List rendering
// ========================

/**
 * state = {
 *   entries: { [id]: { id, displayTime, label, seconds } },
 *   order: string[],
 *   loop: {
 *     active: boolean,
 *     start: number | null,
 *     end: number | null,
 *     startEntryId: string | null,
 *     endEntryId: string | null,
 *     pendingStartId: string | null
 *   }
 * }
 */
function renderList(
  container,
  state,
  onEdit,
  onDelete,
  settings,
  onToggleLoop
) {
  container.innerHTML = "";

  const { entries, order, loop } = state;

  if (!order.length) {
    const empty = document.createElement("div");
    empty.className = "yt-timestamper-list-empty";
    empty.textContent = "No timestamps yet";
    container.appendChild(empty);
    return;
  }

  order.forEach((id) => {
    const entry = entries[id];
    if (!entry) return;

    const item = document.createElement("div");
    item.className = "yt-timestamper-item";
    item.setAttribute("data-entry-id", entry.id);

    // Left: time + label
    const left = document.createElement("div");
    left.className = "yt-timestamper-item-left";

    const timeBtn = document.createElement("button");
    timeBtn.className = "yt-timestamper-time-btn";
    timeBtn.textContent = entry.displayTime;
    timeBtn.title = "Jump to this time";

    timeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const video = getYoutubeVideoElement();
      if (!video) return;
      try {
        video.currentTime = entry.seconds;
        if (settings.autoPlayOnJump) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      } catch (err) {
        console.error("[TimestampHelper] seek failed:", err);
      }
    });

    const labelEl = document.createElement("div");
    labelEl.className = "yt-timestamper-label";
    labelEl.textContent = entry.label || "";

    left.appendChild(timeBtn);
    left.appendChild(labelEl);

    // Right: loop / edit / delete
    const right = document.createElement("div");
    right.className = "yt-timestamper-item-right";

    // Loop button
    const loopBtn = document.createElement("button");
    loopBtn.className = "yt-timestamper-icon-btn yt-timestamper-loop-btn";

    const isPendingA = loop.pendingStartId === entry.id;
    const isLoopStart = loop.active && loop.startEntryId === entry.id;
    const isLoopEnd = loop.active && loop.endEntryId === entry.id;

    if (isLoopStart) {
      loopBtn.textContent = "Loop ⏹"; // A（開始）としてループ中
      loopBtn.title = "Stop loop";
      loopBtn.classList.add("yt-timestamper-loop-active");
    } else if (isPendingA) {
      loopBtn.textContent = "A";
      loopBtn.title = "Selected as start (A)";
      loopBtn.classList.add("yt-timestamper-loop-pending");
    } else if (isLoopEnd) {
      loopBtn.textContent = "B";
      loopBtn.title = "Loop end (B)";
      loopBtn.classList.add("yt-timestamper-loop-end");
    } else {
      loopBtn.textContent = "Loop ▶";
      loopBtn.title = "Use this label as loop start (A)";
    }

    loopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggleLoop(entry.id);
    });

    // Inline edit button
    const editBtn = document.createElement("button");
    editBtn.className = "yt-timestamper-icon-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit label";

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (item.classList.contains("yt-timestamper-item-editing")) return;
      item.classList.add("yt-timestamper-item-editing");

      const prevText = entry.label || "";

      labelEl.style.display = "none";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "yt-timestamper-label-input";
      input.value = prevText;
      labelEl.insertAdjacentElement("afterend", input);
      input.focus();
      input.select();

      const finish = (save) => {
        if (save) {
          const newLabel = input.value.trim();
          if (newLabel !== prevText) {
            onEdit(entry.id, newLabel);
          }
        }
        input.remove();
        labelEl.style.display = "";
        item.classList.remove("yt-timestamper-item-editing");
      };

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          finish(true);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          finish(false);
        }
      });

      input.addEventListener("blur", () => {
        finish(true);
      });
    });

    // Two-step delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "yt-timestamper-icon-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";

    let deleteConfirmTimeout = null;

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (deleteBtn.classList.contains("confirm")) {
        if (deleteConfirmTimeout) {
          clearTimeout(deleteConfirmTimeout);
          deleteConfirmTimeout = null;
        }
        onDelete(entry.id);
        return;
      }

      deleteBtn.classList.add("confirm");
      const originalText = deleteBtn.textContent;
      deleteBtn.textContent = "Really?";
      deleteBtn.title = "Click again to delete";

      deleteConfirmTimeout = setTimeout(() => {
        deleteBtn.classList.remove("confirm");
        deleteBtn.textContent = originalText;
        deleteBtn.title = "Delete";
        deleteConfirmTimeout = null;
      }, 2000);
    });

    right.appendChild(loopBtn);
    right.appendChild(editBtn);
    right.appendChild(deleteBtn);

    item.appendChild(left);
    item.appendChild(right);

    container.appendChild(item);
  });
}

// ========================
// Settings modal
// ========================

function openSettingsModal(panel, settings, onSave) {
  const overlay = panel.querySelector("#yt-timestamper-settings-overlay");
  if (!overlay) return;

  const autoplayRadios = overlay.querySelectorAll(
    'input[name="yt_ts_autoplay"]'
  );
  const copyModeRadios = overlay.querySelectorAll(
    'input[name="yt_ts_copymode"]'
  );

  autoplayRadios.forEach((r) => {
    r.checked = String(settings.autoPlayOnJump) === r.value;
  });

  copyModeRadios.forEach((r) => {
    r.checked = settings.copyMode === r.value;
  });

  overlay.style.display = "flex";

  const saveBtn = overlay.querySelector("#yt-timestamper-settings-save");
  const cancelBtn = overlay.querySelector("#yt-timestamper-settings-cancel");

  const close = () => {
    overlay.style.display = "none";
  };

  const onClickSave = async () => {
    let autoPlayValue = settings.autoPlayOnJump;
    autoplayRadios.forEach((r) => {
      if (r.checked) {
        autoPlayValue = r.value === "true";
      }
    });

    let copyModeValue = settings.copyMode;
    copyModeRadios.forEach((r) => {
      if (r.checked) {
        copyModeValue = r.value;
      }
    });

    const newSettings = {
      ...settings,
      autoPlayOnJump: autoPlayValue,
      copyMode: copyModeValue
    };

    await onSave(newSettings);
    close();
  };

  const onClickCancel = () => {
    close();
  };

  saveBtn.addEventListener("click", onClickSave, { once: true });
  cancelBtn.addEventListener("click", onClickCancel, { once: true });

  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) {
        close();
      }
    },
    { once: true }
  );
}

// ========================
// Main init
// ========================

async function initTimestampHelper() {
  const videoId = getYouTubeVideoId();
  if (!videoId) return;

  // Remove existing panel
  const oldContainers = document.querySelectorAll(".yt-timestamper-container");
  oldContainers.forEach((el) => el.remove());

  const insertTarget =
    document.querySelector("#secondary-inner") ||
    document.querySelector("#secondary") ||
    document.querySelector("#related");

  if (!insertTarget) {
    console.warn("[TimestampHelper] Insert target not found.");
    return;
  }

  const container = document.createElement("div");
  container.className = "yt-timestamper-container";

  const panel = createPanelRoot();
  container.appendChild(panel);

  if (insertTarget.firstChild) {
    insertTarget.insertBefore(container, insertTarget.firstChild);
  } else {
    insertTarget.appendChild(container);
  }

  // Elements
  const bodyEl = panel.querySelector("#yt-timestamper-body");
  const toggleEl = panel.querySelector("#yt-timestamper-toggle-btn");
  const inputEl = panel.querySelector("#yt-timestamper-input");
  const addBtn = panel.querySelector("#yt-timestamper-add-btn");
  const listEl = panel.querySelector("#yt-timestamper-list");
  const copyBtn = panel.querySelector("#yt-timestamper-copy-btn");
  const inlineToastEl = panel.querySelector("#yt-timestamper-inline-toast");
  const gearBtn = panel.querySelector("#yt-timestamper-gear-btn");

  // Settings
  let settings = await loadGlobalSettings();

  // State
  const saved = await loadState(videoId);

  const state = {
    entries: {},
    order: [],
    loop: {
      active: false,
      start: null,
      end: null,
      startEntryId: null,
      endEntryId: null,
      pendingStartId: null
    }
  };

  if (saved && saved.entries && saved.order) {
    state.entries = saved.entries;
    state.order = saved.order;
  }

  const loopState = state.loop;

  const persist = async () => {
    await saveState(videoId, state);
  };

  // Sort by time (seconds ascending)
  const sortOrderByTime = () => {
    state.order.sort((a, b) => {
      const ea = state.entries[a];
      const eb = state.entries[b];
      if (!ea || !eb) return 0;
      return ea.seconds - eb.seconds;
    });
  };

  // Loop helpers
  const clearLoop = () => {
    loopState.active = false;
    loopState.start = null;
    loopState.end = null;
    loopState.startEntryId = null;
    loopState.endEntryId = null;
    loopState.pendingStartId = null;
  };

  const setupLoopFromAtoB = (startId, endId) => {
    const entryA = state.entries[startId];
    const entryB = state.entries[endId];
    if (!entryA || !entryB) return false;

    let startSec = entryA.seconds;
    let endSec = entryB.seconds;

    // 自動で早い方を start、遅い方を end に補正
    let startEntryId = startId;
    let endEntryId = endId;
    if (startSec > endSec) {
      [startSec, endSec] = [endSec, startSec];
      [startEntryId, endEntryId] = [endEntryId, startEntryId];
    }

    if (startSec == null || endSec == null || endSec <= startSec) {
      return false;
    }

    loopState.active = true;
    loopState.start = startSec;
    loopState.end = endSec;
    loopState.startEntryId = startEntryId;
    loopState.endEntryId = endEntryId;

    const videoEl = getYoutubeVideoElement();
    if (videoEl) {
      videoEl.currentTime = loopState.start;
      videoEl.play().catch(() => {});
    }

    return true;
  };

  // Loop monitor
  setInterval(() => {
    if (!loopState.active) return;
    const video = getYoutubeVideoElement();
    if (!video) return;

    if (typeof video.currentTime !== "number" || isNaN(video.currentTime)) {
      return;
    }

    const now = video.currentTime;
    if (loopState.end != null && now >= loopState.end) {
      video.currentTime = loopState.start;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  }, 500);

  // Sortable
  let sortableInstance = null;

  const initSortable = () => {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    if (!listEl || !listEl.querySelector(".yt-timestamper-item")) return;
    if (typeof Sortable === "undefined") {
      console.warn("[TimestampHelper] Sortable is not loaded.");
      return;
    }

    sortableInstance = new Sortable(listEl, {
      animation: 150,
      draggable: ".yt-timestamper-item",
      handle: ".yt-timestamper-item",
      onEnd: async () => {
        const newOrder = [];
        listEl.querySelectorAll(".yt-timestamper-item").forEach((el) => {
          const id = el.getAttribute("data-entry-id");
          if (id) newOrder.push(id);
        });
        state.order = newOrder;
        await persist();
        rerender();
      }
    });
  };

  const rerender = () => {
    renderList(
      listEl,
      state,
      (id, newLabel) => {
        if (!state.entries[id]) return;
        state.entries[id].label = newLabel;
        persist();
        rerender();
      },
      (id) => {
        if (!state.entries[id]) return;

        // If deleting a label used in loop, clear loop
        if (
          state.loop.startEntryId === id ||
          state.loop.endEntryId === id ||
          state.loop.pendingStartId === id
        ) {
          clearLoop();
        }

        delete state.entries[id];
        state.order = state.order.filter((x) => x !== id);
        persist();
        rerender();
      },
      settings,
      (entryId) => {
        // 1. ループ中かつ、このエントリが開始(A)の場合 → ループ停止
        if (loopState.active && loopState.startEntryId === entryId) {
          clearLoop();
          rerender();
          return;
        }

        // 2. まだ A 点も B 点も決まっていない → ここを A 点として選択
        if (!loopState.pendingStartId && !loopState.active) {
          loopState.pendingStartId = entryId;
          rerender();
          return;
        }

        // 3. すでに A 点が選択済み（pendingStartId がある）状態で、
        //    同じラベルが押された → A 点選択をキャンセル
        if (loopState.pendingStartId && loopState.pendingStartId === entryId) {
          loopState.pendingStartId = null;
          rerender();
          return;
        }

        // 4. A 点があり、別のラベルが押された → A〜B でループ開始
        if (loopState.pendingStartId && loopState.pendingStartId !== entryId) {
          const ok = setupLoopFromAtoB(loopState.pendingStartId, entryId);
          loopState.pendingStartId = null;
          if (!ok) {
            showInlineToast(
              inlineToastEl,
              "Cannot determine loop range",
              "error",
              2000
            );
          }
          rerender();
          return;
        }

        // 5. ループ中だが、開始点以外のラベルが押された場合：
        //    仕様としてここでは「何もしない」にしておく
      }
    );

    initSortable();
  };

  rerender();

  // Panel collapse
  const applyCollapsed = (collapsed) => {
    if (!bodyEl || !toggleEl) return;
    if (collapsed) {
      bodyEl.style.display = "none";
      toggleEl.textContent = "▸";
    } else {
      bodyEl.style.display = "";
      toggleEl.textContent = "▾";
    }
  };

  applyCollapsed(false);

  toggleEl.addEventListener("click", () => {
    const collapsed = bodyEl.style.display === "none";
    applyCollapsed(!collapsed);
  });

  // Settings button
  gearBtn.addEventListener("click", () => {
    openSettingsModal(panel, settings, async (newSettings) => {
      settings = newSettings;
      await saveGlobalSettings(settings);
      rerender();
    });
  });

  // Add button
  addBtn.addEventListener("click", async () => {
    const video = getYoutubeVideoElement();
    if (!video) {
      showInlineToast(inlineToastEl, "Video not found", "error", 2000);
      return;
    }
    const t = video.currentTime;
    if (typeof t !== "number" || isNaN(t)) {
      showInlineToast(
        inlineToastEl,
        "Could not get current time",
        "error",
        2000
      );
      return;
    }

    const displayTime = formatTime(t);
    const label = inputEl.value.trim();

    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    state.entries[id] = {
      id,
      displayTime,
      label,
      seconds: Math.floor(t)
    };
    state.order.push(id);

    // auto-sort by time after adding
    sortOrderByTime();

    await persist();
    rerender();

    inputEl.value = "";
    inputEl.focus();
  });

  // Enter -> Add
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn.click();
    }
  });

  // Copy
  copyBtn.addEventListener("click", async () => {
    if (!state.order.length) {
      showInlineToast(
        inlineToastEl,
        "No timestamps to copy",
        "error",
        2000
      );
      return;
    }

    const lines = [];

    if (settings.copyMode === "title_url_and_timestamps_with_links") {
      const title = getVideoTitle();
      if (title) {
        lines.push(`【${title}】`);
      }
      lines.push(getVideoUrl());
      lines.push("");
    }

    state.order.forEach((id) => {
      const entry = state.entries[id];
      if (!entry) return;

      if (settings.copyMode === "timestamps_only") {
        const label = entry.label || "";
        const line = `${entry.displayTime} ${label}`.trim();
        lines.push(line);
      } else if (
        settings.copyMode === "title_url_and_timestamps_with_links"
      ) {
        const label = entry.label || "";
        const tsUrl = getTimestampUrl(entry.seconds);
        const left = `${entry.displayTime} ${label}`.trim();
        const line = `${left} - ${tsUrl}`;
        lines.push(line);
      }
    });

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      showInlineToast(inlineToastEl, "Copied", "success", 1800);
    } catch (e) {
      console.error("[TimestampHelper] clipboard failed:", e);
      showInlineToast(
        inlineToastEl,
        "Failed to copy",
        "error",
        2200
      );
    }
  });
}

// ========================
// SPA URL change observer
// ========================

let lastUrl = location.href;

function observeUrlChange() {
  const observer = new MutationObserver(() => {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      setTimeout(() => {
        initTimestampHelper();
      }, 1000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener("load", () => {
  setTimeout(() => {
    initTimestampHelper();
    observeUrlChange();
  }, 1500);
});
