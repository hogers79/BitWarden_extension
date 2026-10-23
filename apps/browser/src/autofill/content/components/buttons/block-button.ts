import { css } from "@emotion/css";
import { html } from "lit";

import { Theme } from "@bitwarden/common/platform/enums";

import { I18n } from "../common-types";
import { spacing, themes } from "../constants/styles";
import { Block as BlockIcon } from "../icons";

export type BlockButtonProps = {
  i18n: I18n;
  handleNeverAction: (e: Event) => void;
  theme: Theme;
};

/**
 * Fork patch: the "don't offer to save for this site again" button, shown next to the close button
 * on the save-login notification.
 */
export function BlockButton({ handleNeverAction, i18n, theme }: BlockButtonProps) {
  return html`
    <button
      type="button"
      aria-label=${i18n.neverForThisSite}
      title=${i18n.neverForThisSite}
      class=${blockButtonStyles(theme)}
      @click=${handleNeverAction}
    >
      ${BlockIcon({ theme })}
    </button>
  `;
}

const blockButtonStyles = (theme: Theme) => css`
  border: 1px solid transparent;
  border-radius: ${spacing["1"]};
  background-color: transparent;
  cursor: pointer;
  width: 36px;
  height: 36px;
  margin-left: auto;

  :hover {
    border: 1px solid ${themes[theme].primary["600"]};
  }

  > svg {
    width: 18px;
    height: 18px;
    vertical-align: middle;
  }
`;
