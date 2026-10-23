import { css } from "@emotion/css";
import { html } from "lit";

import { Theme, ThemeTypes } from "@bitwarden/common/platform/enums";

import { ActionButton } from "../buttons/action-button";
import { I18n } from "../common-types";
import { spacing, themes } from "../constants/styles";

import { NotificationHeader } from "./header";

export type NeverConfirmationProps = {
  i18n: I18n;
  notificationTestId: string;
  theme: Theme;
  handleCancel: (e: Event) => void;
  handleCloseNotification: (e: Event) => void;
  handleConfirm: (e: Event) => void;
};

/**
 * Fork patch: asks "are you sure?" before a site is added to the never-offer-to-save list.
 */
export function NeverConfirmation({
  i18n,
  notificationTestId,
  theme = ThemeTypes.Light,
  handleCancel,
  handleCloseNotification,
  handleConfirm,
}: NeverConfirmationProps) {
  return html`
    <div data-testid="${notificationTestId}" class=${containerStyles(theme)}>
      ${NotificationHeader({
        handleCloseNotification,
        i18n,
        message: i18n.neverForThisSite,
        theme,
      })}
      <div class=${messageStyles(theme)}>${i18n.neverConfirmQuestion}</div>
      <div class=${buttonRowStyles}>
        ${ActionButton({
          buttonText: i18n.cancel,
          dataTestId: "never-cancel-button",
          fullWidth: false,
          handleClick: handleCancel,
          theme,
        })}
        ${ActionButton({
          buttonText: i18n.neverConfirmYes,
          dataTestId: "never-confirm-button",
          fullWidth: false,
          handleClick: handleConfirm,
          theme,
        })}
      </div>
    </div>
  `;
}

const containerStyles = (theme: Theme) => css`
  position: absolute;
  right: 20px;
  border: 1px solid ${themes[theme].secondary["300"]};
  border-radius: ${spacing["4"]};
  box-shadow: -2px 4px 6px 0px #0000001a;
  background-color: ${themes[theme].background.alt};
  width: 400px;
  overflow: hidden;
`;

const messageStyles = (theme: Theme) => css`
  padding: ${spacing["3"]} ${spacing["4"]} 0 ${spacing["4"]};
  color: ${themes[theme].text.main};
  font-size: 14px;
  line-height: 20px;
`;

const buttonRowStyles = css`
  display: flex;
  justify-content: flex-end;
  gap: ${spacing["2"]};
  padding: ${spacing["3"]} ${spacing["4"]} ${spacing["4"]} ${spacing["4"]};
`;
