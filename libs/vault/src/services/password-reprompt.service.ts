import { Injectable, Optional } from "@angular/core";
import { BehaviorSubject, firstValueFrom, lastValueFrom } from "rxjs";

import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { SensitiveActionVerifier } from "@bitwarden/common/vault/abstractions/sensitive-action-verifier";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { CipherRepromptType } from "@bitwarden/common/vault/enums";
import { CipherViewLike } from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import { DialogService } from "@bitwarden/components";

import { PasswordRepromptComponent } from "../components/password-reprompt.component";

// Fork patch: remember the last clicked element from page load, so a pending unlock can turn it red
// even when the service itself is created only after the click (for example by a route guard).
let lastClicked: HTMLElement | null = null;
let tinted: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => (lastClicked = e.target as HTMLElement), true);
}

function tint(on: boolean) {
  if (on) {
    // A detail page is only reachable once unlocked, so field copies there are never tinted.
    if (lastClicked?.closest("bit-form-field")) {
      return;
    }
    // Prefer the whole card over the small button inside it.
    const el = (lastClicked?.closest("bit-item") ??
      lastClicked?.closest("button, a, [bitmenuitem]")) as HTMLElement | null;
    if (el) {
      el.style.backgroundColor = "rgba(220, 38, 38, 0.45)";
      tinted = el;
    }
  } else if (tinted) {
    tinted.style.backgroundColor = "";
    tinted = null;
  }
}

/**
 * Used to verify the user's Master Password for the "Master Password Re-prompt" feature only.
 * See UserVerificationService for any other situation where you need to verify the user's identity.
 */
@Injectable()
export class PasswordRepromptService {
  constructor(
    private dialogService: DialogService,
    private userVerificationService: UserVerificationService,
    // Fork patch: only provided by the browser extension.
    @Optional() private sensitiveActionVerifier?: SensitiveActionVerifier,
  ) {}

  /**
   * Fork patch: with a sensitive action verifier every cipher is gated by SES, not just ciphers
   * flagged for master password re-prompt.
   */
  isGateRequired(cipher: CipherViewLike): boolean {
    return this.sensitiveActionVerifier != null || cipher.reprompt !== CipherRepromptType.None;
  }

  enabled$ = Utils.asyncToObservable(() => this.userVerificationService.hasMasterPassword());

  protectedFields() {
    return [
      "TOTP",
      "Password",
      "H_Field",
      "Card Number",
      "Security Code",
      "PIN",
      "Account Number",
      "IBAN",
      "SWIFT",
      "Passport Number",
      "National Identification Number",
      "License Number",
    ];
  }

  async passwordRepromptCheck(cipher: CipherViewLike) {
    if (!this.isGateRequired(cipher)) {
      return true;
    }

    return await this.showPasswordPrompt();
  }

  /**
   * Fork patch: true while a sensitive action waits for the unlock check (Windows Hello or the
   * master password). Stays false when SES is already open, so nothing waits.
   */
  readonly gatePending$ = new BehaviorSubject<boolean>(false);

  async showPasswordPrompt() {
    if (this.sensitiveActionVerifier != null) {
      const waiting = !(await this.sensitiveActionVerifier.isActive());
      if (waiting) {
        this.gatePending$.next(true);
        tint(true);
      }
      try {
        const verified = await this.sensitiveActionVerifier.verify();
        if (verified !== null) {
          return verified;
        }
        // No passkey check available: fall back to the master password, which also opens SES.
        const passed = await this.showMasterPasswordDialog();
        if (passed) {
          await this.sensitiveActionVerifier.enable();
        }
        return passed;
      } finally {
        if (waiting) {
          this.gatePending$.next(false);
          tint(false);
        }
      }
    }

    if (!(await this.enabled())) {
      return true;
    }

    return await this.showMasterPasswordDialog();
  }

  /**
   * Fork patch: checks the passkey on every call, ignoring any open SES, but a success opens SES
   * so other sensitive actions are unlocked for the usual period. Falls back to the master
   * password when no passkey check is available. Used for opening Settings.
   */
  async verifyEveryTime(): Promise<boolean> {
    if (this.sensitiveActionVerifier == null) {
      return true;
    }
    tint(true);
    try {
      const verified = await this.sensitiveActionVerifier.verifyOnce();
      if (verified !== null) {
        if (verified) {
          await this.sensitiveActionVerifier.enable();
        }
        return verified;
      }
    } finally {
      tint(false);
    }
    const passed = await this.showMasterPasswordDialog();
    if (passed) {
      await this.sensitiveActionVerifier.enable();
    }
    return passed;
  }

  private async showMasterPasswordDialog() {
    const dialog = await this.dialogService.open<boolean>(PasswordRepromptComponent, {
      ariaModal: true,
    });

    const result = await lastValueFrom(dialog.closed);

    return result === true;
  }

  enabled() {
    return firstValueFrom(this.enabled$);
  }
}
