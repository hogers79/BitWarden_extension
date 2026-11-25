import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { takeUntilDestroyed, toObservable, toSignal } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { of } from "rxjs";
import { map, switchMap } from "rxjs/operators";

import { IconComponent as AppVaultIconComponent } from "@bitwarden/angular/vault/components/icon.component";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import {
  RiskCategory,
  VAULT_HEALTH_REPORT_IDLE,
  VaultHealthReportStatus,
} from "@bitwarden/common/dirt/vault-health/models";
import { VaultHealthReportService } from "@bitwarden/common/dirt/vault-health/services";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { filterOutNullish } from "@bitwarden/common/vault/utils/observable-utilities";
import {
  ButtonModule,
  ItemModule,
  SectionComponent,
  SectionHeaderComponent,
  TypographyModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";
import { PasswordRepromptService } from "@bitwarden/vault";

import { CurrentAccountComponent } from "../../auth/popup/account-switching/current-account.component";
import { PopOutComponent } from "../../platform/popup/components/pop-out.component";
import { PopupHeaderComponent } from "../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../platform/popup/layout/popup-page.component";
import { HealthScanErrorComponent } from "../health/popup/components/health-scan-error/health-scan-error.component";
import { HealthScanningComponent } from "../health/popup/components/health-scanning/health-scanning.component";
import { HealthScanService } from "../health/popup/services/health-scan.service";

/**
 * Moneta: our own vault health check. One page with the three checks (exposed in a data breach,
 * weak, reused), open to everyone. The exposed check sends only the first five characters of each
 * password's SHA-1 hash to Have I Been Pwned; weak and reused are worked out on this device.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "moneta-health",
  templateUrl: "./moneta-health.component.html",
  imports: [
    ButtonModule,
    ItemModule,
    SectionComponent,
    SectionHeaderComponent,
    TypographyModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopOutComponent,
    CurrentAccountComponent,
    AppVaultIconComponent,
    I18nPipe,
    HealthScanningComponent,
    HealthScanErrorComponent,
  ],
})
export class MonetaHealthComponent {
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly cipherService = inject(CipherService);
  private readonly passwordRepromptService = inject(PasswordRepromptService);
  private readonly vaultHealthReportService = inject(VaultHealthReportService);
  private readonly healthScanService = inject(HealthScanService);

  private readonly userId = toSignal(
    this.accountService.activeAccount$.pipe(map((account) => account?.id)),
  );

  private readonly scanState = toSignal(
    toObservable(this.userId).pipe(
      switchMap((userId) =>
        userId
          ? this.vaultHealthReportService.getVaultHealthReport$(userId)
          : of(VAULT_HEALTH_REPORT_IDLE),
      ),
    ),
    { initialValue: VAULT_HEALTH_REPORT_IDLE },
  );

  /** Set when fetching the ciphers to scan fails, which never reaches the report service. */
  private readonly pipelineFailed = toSignal(
    toObservable(this.userId).pipe(
      switchMap((userId) => (userId ? this.healthScanService.pipelineFailed$(userId) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly report = computed(() => this.scanState().report);

  protected readonly loading = computed(
    () => this.scanState().status === VaultHealthReportStatus.Loading,
  );

  protected readonly scanFailed = computed(
    () => this.scanState().status === VaultHealthReportStatus.Error || this.pipelineFailed(),
  );

  private readonly cipherMap = toSignal(
    this.accountService.activeAccount$.pipe(
      switchMap((account) => (account?.id ? this.cipherService.cipherViews$(account.id) : of(null))),
      filterOutNullish(),
      map((ciphers) => new Map<string, CipherView>(ciphers.map((cipher) => [cipher.id, cipher]))),
    ),
    { initialValue: new Map<string, CipherView>() },
  );

  protected readonly sections = computed(() => {
    const report = this.report();
    const ciphers = this.cipherMap();
    const definitions = [
      {
        category: RiskCategory.Exposed,
        titleKey: "exposedPasswordsTitle",
        descriptionKey: "exposedPasswordsDescription",
        emptyKey: "exposedPasswordsEmpty",
      },
      {
        category: RiskCategory.Weak,
        titleKey: "weakPasswordsTitle",
        descriptionKey: "weakPasswordsDescription",
        emptyKey: "weakPasswordEmpty",
      },
      {
        category: RiskCategory.Reused,
        titleKey: "reusedPasswordsTitle",
        descriptionKey: "reusedPasswordsDescription",
        emptyKey: "reusedPasswordEmpty",
      },
    ];
    return definitions.map((definition) => ({
      ...definition,
      rows: (report?.categoryItems[definition.category] ?? []).flatMap((health) => {
        const cipher = ciphers.get(health.cipherId);
        return cipher ? [{ health, cipher }] : [];
      }),
    }));
  });

  constructor() {
    // Scans when there is no report yet, then keeps it current while this page is open.
    toObservable(this.userId)
      .pipe(
        filterOutNullish(),
        switchMap((userId) => this.healthScanService.keepReportCurrent$(userId)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected readonly checkAgain = () => {
    const userId = this.userId();
    if (userId) {
      this.healthScanService.retryScan(userId);
    }
  };

  protected readonly onItemClick = async (cipher: CipherView) => {
    const repromptPassed = await this.passwordRepromptService.passwordRepromptCheck(cipher);
    if (!repromptPassed) {
      return;
    }
    await this.router.navigate(["/view-cipher"], {
      queryParams: { cipherId: cipher.id, type: cipher.type },
    });
  };
}
