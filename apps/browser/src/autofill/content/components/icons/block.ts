import { css } from "@emotion/css";
import { html } from "lit";

import { IconProps } from "../common-types";
import { buildIconColorRule, ruleNames, themes } from "../constants/styles";

/**
 * Fork patch: a "no entry" icon (a ring with a slash) for the "don't offer for this site again"
 * button.
 */
export function Block({ ariaHidden = true, color, disabled, theme }: IconProps) {
  const shapeColor = disabled ? themes[theme].secondary["300"] : color || themes[theme].text.main;
  const fillRule = css(buildIconColorRule(shapeColor, ruleNames.fill));

  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="${ariaHidden}"
    >
      <path
        class=${fillRule}
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"
      />
      <path class=${fillRule} d="M3.1 4.2 4.2 3.1l8.7 8.7-1.1 1.1Z" />
    </svg>
  `;
}
