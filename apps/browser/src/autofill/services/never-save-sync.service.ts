import {
  debounceTime,
  filter,
  firstValueFrom,
  map,
  merge,
  Subscription,
  switchMap,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getOptionalUserId } from "@bitwarden/common/auth/services/account.service";
import { DomainSettingsService } from "@bitwarden/common/autofill/services/domain-settings.service";
import { NeverDomains } from "@bitwarden/common/models/domain/domain-service";
import { SyncService } from "@bitwarden/common/platform/sync";
import { DOMAIN_SETTINGS_DISK, KeyDefinition, StateProvider } from "@bitwarden/common/platform/state";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType, SecureNoteType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { SecureNoteView } from "@bitwarden/common/vault/models/view/secure-note.view";

/** Domain to signed change time. Negative once the domain has been removed. */
type NeverSaveEntries = Record<string, number>;

const NEVER_SAVE_ENTRIES = new KeyDefinition<NeverSaveEntries>(
  DOMAIN_SETTINGS_DISK,
  "forkNeverSaveEntries",
  { deserializer: (value) => value ?? {} },
);

/** Same name the Android app uses, so both find the same note. */
const NOTE_NAME = "Moneta Never Offer To Save";
const DEBOUNCE_MS = 3000;

/**
 * Fork patch: keeps the "never offer to save" list in step with a secure note in the vault, so
 * Bitwarden's own sync carries it between this browser and the Android app.
 *
 * The note body is a JSON map of domain to signed change time. A negative time means the domain
 * was removed, so a removal beats an older addition. Each reconcile stamps local changes, merges
 * the note in (newest change per domain wins), applies the result to the local list and writes the
 * note back if it is out of date. It runs after every vault sync and shortly after the list changes.
 *
 * Domains are shared without a leading "www."; locally both forms are kept because the notification
 * code matches the exact hostname.
 */
export class NeverSaveSyncService {
  private subscription: Subscription | null = null;
  private running: Promise<void> = Promise.resolve();
  private lastCreateAttempt = 0;

  constructor(
    private accountService: AccountService,
    private cipherService: CipherService,
    private domainSettingsService: DomainSettingsService,
    private stateProvider: StateProvider,
    private syncService: SyncService,
  ) {}

  init() {
    this.subscription?.unsubscribe();
    this.subscription = merge(
      this.syncService.activeUserLastSync$(),
      this.domainSettingsService.neverDomains$,
    )
      .pipe(
        debounceTime(DEBOUNCE_MS),
        switchMap(() => this.accountService.activeAccount$.pipe(map((a) => a?.id))),
        filter((id): id is UserId => id != null),
      )
      .subscribe((userId) => {
        // Serialise runs so a change made during a reconcile is picked up by the next one.
        this.running = this.running.then(() => this.reconcile(userId)).catch((): void => undefined);
      });
  }

  private static normalise(host: string): string {
    return host.trim().toLowerCase().replace(/^www\./, "");
  }

  private async reconcile(userId: UserId) {
    const state = this.stateProvider.getGlobal(NEVER_SAVE_ENTRIES);
    const entries: NeverSaveEntries = { ...((await firstValueFrom(state.state$)) ?? {}) };
    const localDomains: NeverDomains = (await firstValueFrom(this.domainSettingsService.neverDomains$)) ?? {};
    const now = Date.now();

    // Stamp local changes since the last run.
    const localActive = new Set(Object.keys(localDomains).map(NeverSaveSyncService.normalise));
    localActive.forEach((d) => {
      if ((entries[d] ?? 0) <= 0) {
        entries[d] = now;
      }
    });
    Object.keys(entries).forEach((d) => {
      if (entries[d] > 0 && !localActive.has(d)) {
        entries[d] = -now;
      }
    });

    // Merge with the note.
    const note = await this.findNote(userId);
    let remote: NeverSaveEntries = {};
    if (note != null) {
      try {
        remote = JSON.parse((note.notes ?? "").trim() || "{}") as NeverSaveEntries;
      } catch {
        return; // Not ours to overwrite.
      }
    }
    const merged: NeverSaveEntries = {};
    new Set([...Object.keys(entries), ...Object.keys(remote)]).forEach((d) => {
      const candidates = [entries[d], remote[d]].filter((t) => typeof t === "number");
      merged[d] = candidates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
    });
    await state.update(() => merged);

    // Apply to the local list: drop removed domains, add new ones in both www forms.
    const next: NeverDomains = {};
    Object.keys(localDomains).forEach((host) => {
      if ((merged[NeverSaveSyncService.normalise(host)] ?? 0) > 0) {
        next[host] = null;
      }
    });
    Object.keys(merged)
      .filter((d) => merged[d] > 0)
      .forEach((d) => {
        if (!Object.keys(next).some((h) => NeverSaveSyncService.normalise(h) === d)) {
          next[d] = null;
          next["www." + d] = null;
        }
      });
    const same =
      Object.keys(next).length === Object.keys(localDomains).length &&
      Object.keys(next).every((h) => h in localDomains);
    if (!same) {
      await this.domainSettingsService.setNeverDomains(next);
    }

    // Write the note back if it is behind.
    const same2 = JSON.stringify(sorted(merged)) === JSON.stringify(sorted(remote));
    if (same2) {
      return;
    }
    const body = JSON.stringify(sorted(merged));
    if (note != null) {
      note.notes = body;
      await this.cipherService.updateWithServer(note, userId);
    } else if (Object.keys(merged).length > 0 && now - this.lastCreateAttempt > 120_000) {
      this.lastCreateAttempt = now;
      const created = new CipherView();
      created.type = CipherType.SecureNote;
      created.name = NOTE_NAME;
      created.notes = body;
      created.secureNote = new SecureNoteView();
      created.secureNote.type = SecureNoteType.Generic;
      await this.cipherService.createWithServer(created, userId);
    }
  }

  private async findNote(userId: UserId): Promise<CipherView | null> {
    const ciphers = await this.cipherService.getAllDecrypted(userId);
    return (
      ciphers.find(
        (c) => c.type === CipherType.SecureNote && c.name === NOTE_NAME && c.deletedDate == null,
      ) ?? null
    );
  }
}

function sorted(entries: NeverSaveEntries): NeverSaveEntries {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}
