import { svg } from "../svg";

// Moneta: our own Health tab icon, a shield with a tick.
export const MonetaHealthInactive = svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2L20 5.5V11.5C20 16.5 16.6 20.7 12 22C7.4 20.7 4 16.5 4 11.5V5.5L12 2ZM12 4.2L6 6.8V11.5C6 15.4 8.5 18.7 12 19.9C15.5 18.7 18 15.4 18 11.5V6.8L12 4.2Z" class="tw-fill-fg-body"/>
    <path d="M8.4 11.9L9.8 10.5L11.4 12.1L15 8.5L16.4 9.9L11.4 14.9L8.4 11.9Z" class="tw-fill-fg-body"/>
  </svg>
`;

export const MonetaHealthActive = svg`
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 4.2L18 6.8V11.5C18 15.4 15.5 18.7 12 19.9C8.5 18.7 6 15.4 6 11.5V6.8L12 4.2Z" class="tw-fill-fg-brand-soft"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2L20 5.5V11.5C20 16.5 16.6 20.7 12 22C7.4 20.7 4 16.5 4 11.5V5.5L12 2ZM12 4.2L6 6.8V11.5C6 15.4 8.5 18.7 12 19.9C15.5 18.7 18 15.4 18 11.5V6.8L12 4.2Z" class="tw-fill-fg-brand"/>
    <path d="M8.4 11.9L9.8 10.5L11.4 12.1L15 8.5L16.4 9.9L11.4 14.9L8.4 11.9Z" class="tw-fill-fg-brand"/>
  </svg>
`;
