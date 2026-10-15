import { inject } from "@angular/core";
import { CanActivateFn, NavigationEnd, Router } from "@angular/router";

import { PasswordRepromptService } from "@bitwarden/vault";

import {
  isInsideSettings,
  setInsideSettings,
} from "../../platform/popup/view-cache/settings-session";

/** The other main tabs. Landing on one of these means the user has left Settings. */
const OTHER_TAB_URL = /^\/tabs\/(vault|current|generator|send)(\/|\?|$)/;

let watchingNavigation = false;

/**
 * Fork patch: opening Settings from another tab needs a passkey check. Moving between Settings
 * pages (for example back from a sub menu to the Settings menu) does not ask again. This is
 * independent of SES, so it neither uses an open SES nor opens one.
 */
export const settingsSensitiveGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const passwordRepromptService = inject(PasswordRepromptService);

  if (!watchingNavigation) {
    watchingNavigation = true;
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && OTHER_TAB_URL.test(event.urlAfterRedirects)) {
        setInsideSettings(false);
      }
    });
  }

  if (isInsideSettings()) {
    return true;
  }

  const verified = await passwordRepromptService.verifyEveryTime();
  setInsideSettings(verified);
  return verified;
};
