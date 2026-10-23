import { Component, inject } from "@angular/core";
import { combineLatest, map, Observable, startWith, switchMap } from "rxjs";

import { NudgesService } from "@bitwarden/angular/vault";
import {
  VaultInactive,
  VaultActive,
  GeneratorInactive,
  GeneratorActive,
  SyncNav,
  SettingsInactive,
  SettingsActive,
} from "@bitwarden/assets/svg";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { AutofillSettingsServiceAbstraction } from "@bitwarden/common/autofill/services/autofill-settings.service";
import { BottomNavigationButton } from "@bitwarden/components";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { ToastService } from "@bitwarden/components";

import { HealthAccessService } from "../dirt/health/popup/services/health-access.service";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "app-tabs-v2",
  templateUrl: "./tabs-v2.component.html",
  standalone: false,
})
export class TabsV2Component {
  constructor(
    private nudgesService: NudgesService,
    private accountService: AccountService,
    private autofillSettingsService: AutofillSettingsServiceAbstraction,
    private syncService: SyncService,
    private toastService: ToastService,
    private i18nService: I18nService,
  ) {}

  private healthAccessService = inject(HealthAccessService);

  private userId$ = this.accountService.activeAccount$.pipe(getUserId);
  private hasActiveBadges$ = this.userId$.pipe(
    switchMap((userId) => this.nudgesService.hasActiveBadges$(userId)),
  );

  private showSettingsBerry$ = combineLatest([
    this.hasActiveBadges$,
    this.autofillSettingsService.showClipboardSettingUpdateNotification$,
  ]).pipe(map(([hasBadges, showClipboard]) => hasBadges || showClipboard));

  private healthNavButton$ = this.userId$.pipe(
    switchMap((userId) => this.healthAccessService.healthNavButton$(userId)),
  );

  private async syncNow() {
    const success = await this.syncService.fullSync(true);
    this.toastService.showToast({
      variant: success ? "success" : "error",
      title: "",
      message: this.i18nService.t(success ? "syncingComplete" : "syncingFailed"),
    });
  }

  protected navButtons$: Observable<BottomNavigationButton[]> = combineLatest([
    this.showSettingsBerry$.pipe(startWith(false)),
    this.healthNavButton$.pipe(startWith(undefined)),
  ]).pipe(
    map(([showBerry, healthNavButton]) => {
      const buttons: BottomNavigationButton[] = [
        {
          label: "vault",
          page: "/tabs/vault",
          icon: VaultInactive,
          iconActive: VaultActive,
        },
        {
          label: "generator",
          page: "/tabs/generator",
          icon: GeneratorInactive,
          iconActive: GeneratorActive,
        },
        {
          label: "sync",
          page: "/tabs/sync",
          icon: SyncNav,
          iconActive: SyncNav,
          action: () => void this.syncNow(),
        },
        ...(healthNavButton ? [healthNavButton] : []),
        {
          label: "settings",
          page: "/tabs/settings",
          icon: SettingsInactive,
          iconActive: SettingsActive,
          showBerry,
        },
      ];
      return buttons;
    }),
  );
}
