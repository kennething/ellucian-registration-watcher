import { ActivityType, Client, GatewayIntentBits } from "discord.js";
import { loadEvents } from "./util/loaders.ts";
import { URL } from "node:url";
import ENV from "../../env.ts";

export async function startBot() {
  // Initialize the client
  const client = new Client({ intents: [GatewayIntentBits.DirectMessages] });

  // Load the events and commands
  const events = await loadEvents(new URL("events/", import.meta.url));

  // Register the event handlers
  for (const event of events) {
    client[event.once ? "once" : "on"](event.name, async (...args) => {
      try {
        await event.execute(...args);
      } catch (error) {
        console.error(`Error executing event ${String(event.name)}:`, error);
      }
    });
  }

  // Login to the client
  await client.login(ENV.DISCORD_TOKEN);
  client.user?.setPresence({
    status: "idle",
    activities: [
      {
        name: "with Binghamton University's API",
        type: ActivityType.Playing,
        url: ENV.FRONTEND_URL
      }
    ]
  });
}
