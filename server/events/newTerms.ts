import { refreshConstantData } from "../utils/sqlite";
import { waitForInterval } from "../utils/functions";
import ENV from "../../env";

export function watchNewTermsLoop(): void {
  waitForInterval(ENV.NEW_TERMS_INTERVAL, ENV.NEW_TERMS_OFFSET, async () => {
    refreshConstantData();
    // TODO: send notification on new terms
  });
}
