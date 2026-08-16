import { ButtonStyle, ContainerBuilder, InteractionEditReplyOptions, MessageFlags } from "discord.js";
import ENV from "../../../env.ts";

export enum ErrorCodes {
  UNAUUTHORIZED = 418,

  USER_DB_FETCH_FAIL = 2000,

  WATCHER_DB_FETCH_FAIL = 3000,
  WATCHER_DB_UPDATE_FAIL = 3001,

  SCHEDULE_DB_FETCH_FAIL = 4000,
  EMPTY_SCHEDULE = 4001,
  NO_SCHEDULE = 4002,

  SEARCH_NO_CLASSES = 5001,
  SEARCH_EXPIRED = 5002
}

export function getSignupResponse(): InteractionEditReplyOptions {
  const container = new ContainerBuilder().setAccentColor(ENV.ERROR_COLOR).addSectionComponents((section) => {
    section.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`You need an account first womp womp\n-# error code ${ErrorCodes.UNAUUTHORIZED}`));
    if (ENV.FRONTEND_URL) section.setButtonAccessory((button) => button.setURL(ENV.FRONTEND_URL!).setLabel("Sign up").setStyle(ButtonStyle.Link));
    return section;
  });

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

/** @params message - if omitted, a generic error message */
export function getErrorResponse(code: ErrorCodes, message?: string): InteractionEditReplyOptions {
  const container = new ContainerBuilder()
    .setAccentColor(ENV.ERROR_COLOR)
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${message ?? "Something went wrong. Try again later"}\n-# error code ${code}`));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}
