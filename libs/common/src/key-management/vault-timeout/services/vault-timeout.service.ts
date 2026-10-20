// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { combineLatest, concatMap, firstValueFrom } from "rxjs";

// This import has been flagged as unallowed for this class. It may be involved in a circular dependency loop.
// eslint-disable-next-line no-restricted-imports
import { LogoutService } from "@bitwarden/auth/common";
import { LockService, LockSource } from "@bitwarden/unlock";

import { AccountService } from "../../../auth/abstractions/account.service";
import { AuthService } from "../../../auth/abstractions/auth.service";
import { AuthenticationStatus } from "../../../auth/enums/authentication-status";
import { LogService } from "../../../platform/abstractions/log.service";
import { PlatformUtilsService } from "../../../platform/abstractions/platform-utils.service";
import { TaskSchedulerService, ScheduledTaskNames } from "../../../platform/scheduling";
import { UserId } from "../../../types/guid";
import { VaultTimeoutSettingsService } from "../abstractions/vault-timeout-settings.service";
import { VaultTimeoutService as VaultTimeoutServiceAbstraction } from "../abstractions/vault-timeout.service";
import { VaultTimeoutAction } from "../enums/vault-timeout-action.enum";

export class VaultTimeoutService implements VaultTimeoutServiceAbstraction {
  private inited = false;

  constructor(
    private accountService: AccountService,
    protected platformUtilsService: PlatformUtilsService,
    private authService: AuthService,
    private vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    private taskSchedulerService: TaskSchedulerService,
    protected logService: LogService,
    private lockService: LockService,
    private logoutService: LogoutService,
  ) {
    this.taskSchedulerService.registerTaskHandler(
      ScheduledTaskNames.vaultTimeoutCheckInterval,
      () => this.checkVaultTimeout(),
    );
    this.taskSchedulerService.registerTaskHandler(
      ScheduledTaskNames.autoUnlockExpiryCheckInterval,
      () => this.checkAutoUnlockExpiry(),
    );
  }

  async init(checkOnInterval: boolean) {
    if (this.inited) {
      return;
    }

    this.inited = true;
    if (checkOnInterval) {
      this.startCheck();
    }
  }

  startCheck() {
    this.checkVaultTimeout().catch((error) => this.logService.error(error));
    this.taskSchedulerService.setInterval(
      ScheduledTaskNames.vaultTimeoutCheckInterval,
      10 * 1000, // check every 10 seconds
    );
    // Fork patch: the stay-unlocked expiry is checked once when the browser opens (when the stored
    // key is read to unlock) and then every six hours.
    this.taskSchedulerService.setInterval(
      ScheduledTaskNames.autoUnlockExpiryCheckInterval,
      6 * 60 * 60 * 1000, // every 6 hours
    );
  }

  /**
   * Fork patch: locks any unlocked user whose stay-unlocked period has run out. Runs every six
   * hours, not on every timeout check, because it reads the stored key.
   */
  async checkAutoUnlockExpiry(): Promise<void> {
    const accounts = await firstValueFrom(this.accountService.accounts$);
    for (const userIdString of Object.keys(accounts ?? {})) {
      const userId = userIdString as UserId;
      const authStatus = await this.authService.getAuthStatus(userId);
      if (
        authStatus === AuthenticationStatus.Locked ||
        authStatus === AuthenticationStatus.LoggedOut
      ) {
        continue;
      }
      if (await this.vaultTimeoutSettingsService.isAutoUnlockExpired(userId)) {
        await this.executeTimeoutAction(userId);
      }
    }
  }

  async checkVaultTimeout(): Promise<void> {
    // Get whether or not any view is focused a single time so it can be compared for each user
    const isViewFocused = await this.platformUtilsService.isAnyViewFocused();

    await firstValueFrom(
      combineLatest([
        this.accountService.activeAccount$,
        this.accountService.accountActivity$,
      ]).pipe(
        concatMap(async ([activeAccount, accountActivity]) => {
          const activeUserId = activeAccount?.id;
          for (const userIdString in accountActivity) {
            const userId = userIdString as UserId;
            if (
              userId != null &&
              (await this.shouldLock(userId, accountActivity[userId], activeUserId, isViewFocused))
            ) {
              await this.executeTimeoutAction(userId);
            }
          }
        }),
      ),
    );
  }

  private async shouldLock(
    userId: string,
    lastActive: Date,
    activeUserId: string,
    isViewFocused: boolean,
  ): Promise<boolean> {
    // Fork patch: the stay-unlocked expiry is NOT checked here. It used to run every 10 seconds
    // and read the stored key each time. It is now checked once, when the browser opens, by
    // DefaultAutoUnlockService.getAutoUnlockKey(), which discards an expired key before unlocking.
    if (isViewFocused && userId === activeUserId) {
      // We know a view is focused and this is the currently active user
      // which means they are likely looking at their vault
      // and they should not lock.
      return false;
    }

    // Check if vault timeout is suppressed by shared unlock
    if (await this.vaultTimeoutSettingsService.isVaultTimeoutSuppressed(userId as UserId)) {
      return false;
    }

    const authStatus = await this.authService.getAuthStatus(userId);
    if (
      authStatus === AuthenticationStatus.Locked ||
      authStatus === AuthenticationStatus.LoggedOut
    ) {
      return false;
    }

    const vaultTimeout = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutByUserId$(userId),
    );

    if (typeof vaultTimeout === "string") {
      return false;
    }

    if (lastActive == null) {
      return false;
    }

    const vaultTimeoutSeconds = vaultTimeout * 60;
    const diffSeconds = (new Date().getTime() - lastActive.getTime()) / 1000;
    return diffSeconds >= vaultTimeoutSeconds;
  }

  private async executeTimeoutAction(userId: UserId): Promise<void> {
    const timeoutAction = await firstValueFrom(
      this.vaultTimeoutSettingsService.getVaultTimeoutActionByUserId$(userId),
    );
    timeoutAction === VaultTimeoutAction.LogOut
      ? await this.logoutService.logout(userId, "vaultTimeout")
      : await this.lockService.lock(userId, LockSource.VaultTimeout);
  }
}
