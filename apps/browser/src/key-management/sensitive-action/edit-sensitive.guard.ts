import { inject } from "@angular/core";
import { CanActivateFn } from "@angular/router";

import { PasswordRepromptService } from "@bitwarden/vault";

/**
 * Fork patch: editing an item needs the passkey check. Uses SES, so it asks only when sensitive
 * mode is not already open.
 */
export const editSensitiveGuard: CanActivateFn = async () => {
  return await inject(PasswordRepromptService).showPasswordPrompt();
};
