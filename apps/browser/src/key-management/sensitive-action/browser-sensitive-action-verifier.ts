import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import {
  SES_ACTIVATED_AT,
  SES_DURATION_MINUTES,
  SES_FAILED_ATTEMPTS,
  SES_DURATION_MS,
  SES_DURATION_OPTIONS_MINUTES,
} from "@bitwarden/common/key-management/vault-timeout";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { SensitiveActionVerifier } from "@bitwarden/common/vault/abstractions/sensitive-action-verifier";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { WebAuthnPrfUnlockService } from "@bitwarden/key-management-ui";
import { UserId } from "@bitwarden/common/types/guid";
import { StateProvider } from "@bitwarden/state";

/**
 * Fork patch: runs the Windows Hello passkey check for sensitive actions and tracks SES.
 */
export class BrowserSensitiveActionVerifier implements SensitiveActionVerifier {
  constructor(
    private accountService: AccountService,
    private stateProvider: StateProvider,
    private webAuthnPrfUnlockService: WebAuthnPrfUnlockService,
    private logService: LogService,
    private messagingService: MessagingService,
  ) {}

  /**
   * Runs the passkey check. Three failed checks in a row, across any period and any number of
   * sessions, log the account out (not lock). A success resets the count.
   */
  private async runPasskeyCheck(userId: UserId): Promise<boolean> {
    try {
      await this.webAuthnPrfUnlockService.unlockVaultWithPrf(userId);
    } catch (error) {
      // Cancelled or failed checks refuse the action; nothing is unlocked or leaked.
      this.logService.info("[SensitiveActionVerifier] Passkey check failed or was cancelled", error);
      const previous =
        (await firstValueFrom(this.stateProvider.getUserState$(SES_FAILED_ATTEMPTS, userId))) ?? 0;
      const failures = previous + 1;
      if (failures >= 3) {
        await this.stateProvider.setUserState(SES_FAILED_ATTEMPTS, null, userId);
        this.messagingService.send("logout", { userId });
      } else {
        await this.stateProvider.setUserState(SES_FAILED_ATTEMPTS, failures, userId);
      }
      return false;
    }
    await this.stateProvider.setUserState(SES_FAILED_ATTEMPTS, null, userId);
    return true;
  }

  async isPasskeyAvailable(): Promise<boolean> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    return await this.webAuthnPrfUnlockService.isPrfUnlockAvailable(userId);
  }

  async verify(forceCheck = false): Promise<boolean | null> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));

    const activatedAt = await firstValueFrom(
      this.stateProvider.getUserState$(SES_ACTIVATED_AT, userId),
    );
    const minutes = await firstValueFrom(
      this.stateProvider.getUserState$(SES_DURATION_MINUTES, userId),
    );
    const durationMs =
      minutes != null && SES_DURATION_OPTIONS_MINUTES.includes(minutes)
        ? minutes * 60 * 1000
        : SES_DURATION_MS;
    if (!forceCheck && activatedAt != null && Date.now() - activatedAt < durationMs) {
      return true;
    }

    if (!(await this.webAuthnPrfUnlockService.isPrfUnlockAvailable(userId))) {
      return null;
    }

    if (!(await this.runPasskeyCheck(userId))) {
      return false;
    }

    await this.enable();
    return true;
  }

  async verifyOnce(): Promise<boolean | null> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));

    if (!(await this.webAuthnPrfUnlockService.isPrfUnlockAvailable(userId))) {
      return null;
    }

    return await this.runPasskeyCheck(userId);
  }

  async enable(): Promise<void> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    await this.stateProvider.setUserState(SES_ACTIVATED_AT, Date.now(), userId);
  }
}
