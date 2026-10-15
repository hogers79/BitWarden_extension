/**
 * Fork patch: whether the user is currently inside Settings, i.e. has passed the Settings passkey
 * check and has not yet moved to another main tab. Lives in the popup's memory only, so a freshly
 * opened popup always starts outside Settings.
 */
let insideSettings = false;

export function isInsideSettings(): boolean {
  return insideSettings;
}

export function setInsideSettings(value: boolean): void {
  insideSettings = value;
}
