import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";

import {
  GlobalStateProvider,
  KeyDefinition,
  POPUP_STYLE_DISK,
} from "@bitwarden/common/platform/state";

import { BrowserApi } from "../../browser/browser-api";
import BrowserPopupUtils, {
  POPUP_WIDTH_STORAGE_KEY,
  PopupWidthOption,
  PopupWidthOptions,
} from "../../browser/browser-popup-utils";

const POPUP_WIDTH_KEY_DEF = new KeyDefinition<PopupWidthOption>(POPUP_STYLE_DISK, "popup-width", {
  deserializer: (s) => s,
});

export const POPUP_HEIGHT_STORAGE_KEY = "moneta-popup-height";
export const PopupHeightOptions = [600, 650, 700, 800, 900, 1000] as const;
export const DEFAULT_POPUP_HEIGHT = 650;

/**
 * Handles sizing the popup based on available width/height, which can be affected by
 * user default zoom level.
 * Updates the extension popup width based on a user setting.
 **/
@Injectable({ providedIn: "root" })
export class PopupSizeService {
  private static readonly LocalStorageKey = POPUP_WIDTH_STORAGE_KEY;
  private readonly state = inject(GlobalStateProvider).get(POPUP_WIDTH_KEY_DEF);

  readonly width$: Observable<PopupWidthOption> = this.state.state$.pipe(
    map((state) => state ?? "default"),
  );

  async setWidth(width: PopupWidthOption) {
    await this.state.update(() => width);
  }

  /** Begin listening for state changes */
  async init() {
    this.width$.subscribe((width: PopupWidthOption) => {
      void PopupSizeService.setStyle(width);
      localStorage.setItem(PopupSizeService.LocalStorageKey, width);
    });
  }

  /**
   * Moneta: the popup height is a setting (Appearance, "Extension height"), kept in localStorage so it
   * is known before the page renders. The browser (Curia) allows up to 1000 px; on a shorter screen
   * the height is cut to what fits.
   */
  static getStoredHeight(): number {
    try {
      const stored = Number(localStorage.getItem(POPUP_HEIGHT_STORAGE_KEY));
      return (PopupHeightOptions as readonly number[]).includes(stored)
        ? stored
        : DEFAULT_POPUP_HEIGHT;
    } catch {
      return DEFAULT_POPUP_HEIGHT;
    }
  }

  async setPopupHeight(height: number) {
    localStorage.setItem(POPUP_HEIGHT_STORAGE_KEY, String(height));
    await this.setHeight();
  }

  async setHeight() {
    const isInChromeTab = await BrowserPopupUtils.isInTab();
    const html = window.document.documentElement;
    html.classList.remove("body-sm", "body-xs", "body-xxs", "body-3xs");
    html.style.minHeight = "";

    const chosenHeight = PopupSizeService.getStoredHeight();
    // Use a 100px offset when calculating screen height to account for browser container elements
    const screenAvailHeight = window.screen.availHeight - 100;
    const availHeight = Math.min(screenAvailHeight, chosenHeight);

    if (!BrowserPopupUtils.inPopup(window) || isInChromeTab) {
      html.classList.add("body-full");
    } else if (availHeight < 300) {
      html.classList.add("body-3xs");
    } else if (availHeight < 400) {
      html.classList.add("body-xxs");
    } else if (availHeight < 500) {
      html.classList.add("body-xs");
    } else {
      html.style.minHeight = `${Math.floor(availHeight)}px`;
    }
  }
  private static async setStyle(width: PopupWidthOption) {
    const isInTab = await BrowserPopupUtils.isInTab();
    const pxWidth = PopupWidthOptions[width] ?? PopupWidthOptions.default;

    if (BrowserPopupUtils.inPopout(window)) {
      const currentWindow = await BrowserApi.getCurrentWindow();
      if (currentWindow.id != null) {
        await BrowserApi.updateWindowProperties(currentWindow.id, { width: pxWidth });
      }
      return;
    }

    if (!BrowserPopupUtils.inPopup(window) || isInTab) {
      return;
    }

    document.body.style.width = `${pxWidth}px`;
  }

  /**
   * To keep the popup size from flickering on bootstrap, we store the width in `localStorage` so we can quickly & synchronously reference it.
   **/
  static initBodyWidthFromLocalStorage() {
    let storedValue = localStorage.getItem(PopupSizeService.LocalStorageKey);

    // Migrate old width option keys that no longer exist
    const migratedValue = PopupSizeService.migrateOldWidthOption(storedValue);
    if (migratedValue !== storedValue && migratedValue != null) {
      storedValue = migratedValue;
      localStorage.setItem(PopupSizeService.LocalStorageKey, storedValue);
    }

    void this.setStyle(PopupSizeService.toPopupWidthOption(migratedValue));
  }

  /**
   * Maps old popup width option keys to their new equivalents.
   * Old "wide" (480px) is now "default", and old "extraWide" (600px) is now "wide".
   */
  private static migrateOldWidthOption(value: string | null): string | null {
    if (value === "extraWide") {
      return "wide";
    }
    return value;
  }

  private static isPopupWidthOption(value: string | null): value is PopupWidthOption {
    return value != null && value in PopupWidthOptions;
  }

  private static toPopupWidthOption(value: string | null): PopupWidthOption {
    const migrated = PopupSizeService.migrateOldWidthOption(value);
    if (PopupSizeService.isPopupWidthOption(migrated)) {
      return migrated;
    }
    return "default";
  }
}
