# Ellucian Registration Watcher

This is the Express.js server and Discord.js bot for
[Bad Scheduler](https://bschedule.kennethng.dev) (specifically tailored for
Binghamton University), but the methods used for fetching data can _probably_
be applied to any school that uses Ellucian's Banner system.

Classes to be fetched are batched together and use a single requester to
minimize the number of requests sent to the Banner API.

> \[!IMPORTANT\]
>
> This is NOT a ready-to-use course scheduler. The published bot commands here
> only allow for getting data.
>
> You'll need to create some frontend, be it a web app or more bot commands, to
> allow users to create and manage their stuff.

> \[!CAUTION\]
>
> This may or may not be allowed by your university. Don't get expelled!

# Installation

## Create a Discord Bot

1. Go to the
   [Discord Developer Portal](https://discord.com/developers/applications) and
   create a new application.

   Note the Application ID. This will be your `APPLICATION_ID`.

2. Under the "Bot" tab, click "Add Bot" and copy the bot token. This will be
   your `DISCORD_TOKEN`.

3. Also enable the `Message Content Intent` Priveleged Intent.

### If you will NOT be running a frontend using Discord's OAuth2:

4. Under the "Installation" tab, select `User Install` as the Installation
   Context, `Discord Provided Link` as the Install Link, and
   `applications.commands` as the Default Install scopes.

   Copy the generated link and you can add your bot!

### If you WILL be running a frontend using Discord's OAuth2:

4. Under the "OAuth2" tab, copy the Client ID and reset the Client Secret.
   These will be your `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

5. Create a redirect URL to `<BACKEND_URL>/auth/discord/callback` (with your
   backend URL replaced).

6. Go to `<BACKEND_URL>/auth/discord` and you can add your bot!

## Run the server

1. Install [Bun](https://bun.sh).

2. Create a `.env` file in the root directory. See
   [here](./README.md#environment-variables) for config options.

3. Install dependencies:

   ```sh
   bun install
   ```

4. Start the bot and/or server:

   ```sh
   bun serve
   ```

# Bot Commands

`APPLICATION_ID` must be defined in your `.env` in order to deploy/undeploy
commands.

## Registering

1. Register the commands:

   ```sh
   bun deploy
   ```

You only need to register commands if you change the command's data. Changing
the command's behavior (i.e. editing the `execute` function) does not require
re-registering.

## Unregistering

2. Unregister the commands:

   ```sh
   bun undeploy
   ```

# Environment Variables

## General

| Variable                       | Description                                                                                                                                                            | Default               | Required |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| `BACKEND_URL`                  | URL with protocol, don't append `/`.                                                                                                                                   |                       | yes      |
| `PORT`                         | Port to run the server on.                                                                                                                                             | `6969`                |          |
| `LOG_LEVEL`                    | `debug`, `info`, `warn`, or `error`.                                                                                                                                   | `warn`                |          |
| `USER_WATCHER_LIMIT`           | Maximum number of watchers a user can create.                                                                                                                          | 67                    |          |
| `USER_SCHEDULE_LIMIT`          | Maximum number of schedules a user can create.                                                                                                                         | 10                    |          |
| `TIMEZONE`                     | Timezone to use for all date/time operations. See list of valid timezones [here](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).                        | `America/New_York`    |          |
| `BANNER_API_URL`               | URL with protocol to your university's course catalog, don't append `/`. (ex. `https://ssb.cc.binghamton.edu:8484`, `https://banssb.yourcollege.edu`)                  |                       | yes      |
| `RMP_SCHOOL_ID`                | ID of your school on [Rate My Professors](https://www.ratemyprofessors.com) - find this by searching for your school and looking at the URL.                           |                       |          |
| `MATH_SCHEDULE_URL`            | You probably don't have this but the URL to the math course schedule for your school, don't append `/`.                                                                |                       |          |
| `MAX_REQUEST_CLIENTS`          | Maximum number of concurrent request clients to use for fetching data from the Banner API. Clients cannot be used concurrently so requests are queued if all are busy. | `10`                  |          |
| `NEW_REQUEST_CLIENT_THRESHOLD` | Number of requests in the lowest request client's queue before a new client is created.                                                                                | `0`                   |          |
| `CLIENT_LIFETIME`              | Inactivity time, in seconds, of a request client before it's deleted.                                                                                                  | `1200` (20 minutes)   |          |
| `DATABASE_PATH`                | Path to the SQLite database file. If the database file doesn't exist, a new one will be created.                                                                       | `./server/db.sqlite3` |          |
| `BACKUP_DATABASE_PATH`         | Path to a folder where the database will be backed up before watchers are purged.                                                                                      | `./server/`           |          |

## Automation

| Variable                    | Description                                                                                                                 | Default                    | Required |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| `CLASS_HISTORY_24H_ENTRIES` | Number of entries to log in the class history over the last 24 hours. This should be an interval of `CLASS_FETCH_INTERVAL`. | `72` (once per 20 minutes) |          |
| `CLASS_HISTORY_7D_ENTRIES`  | Number of entries to log in the class history over the last 7 days. This should be an interval of `CLASS_FETCH_INTERVAL`.   | `28` (once per 6 hours)    |          |
| `CLASS_HISTORY_28D_ENTRIES` | Number of entries to log in the class history over the last 28 days. This should be an interval of `CLASS_FETCH_INTERVAL`.  | `28` (once per 1 day)      |          |

### Class Scraping

| Variable                | Description                                                                                              | Default            | Required |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| `CLASS_FETCH_INTERVAL`  | Interval, in seconds, to fetch new class data. Set to `0` to disable class fetching.                     | `600` (10 minutes) |          |
| `CLASS_FETCH_OFFSET`    | Offset, in seconds, to wait before fetching new class data.                                              | `50`               |          |
| `NOTIFICATION_COOLDOWN` | Cooldown, in seconds, to wait before sending another notification for the same watcher to the same user. | `43200` (12 hours) |          |

### Search Scraping

| Variable                | Description                                                                            | Default           | Required |
| ----------------------- | -------------------------------------------------------------------------------------- | ----------------- | -------- |
| `SEARCH_FETCH_INTERVAL` | Interval, in seconds, to fetch new search data. Set to `0` to disable search fetching. | `14400` (4 hours) |          |
| `SEARCH_FETCH_OFFSET`   | Offset, in seconds, to wait before fetching new search data.                           | `360` (6 minutes) |          |

## New Term Detection

| Variable             | Description                                                                             | Default            | Required |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------ | -------- |
| `NEW_TERMS_INTERVAL` | Interval, in seconds, to fetch new term data. Set to `0` to disable new term detection. | `604800` (7 days)  |          |
| `NEW_TERMS_OFFSET`   | Offset, in seconds, to wait before fetching new term data.                              | `64800` (18 hours) |          |

### Purging

| Variable                  | Description                                                                                                                                   | Default           | Required |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------- |
| `OUTDATED_PURGE_INTERVAL` | Interval, in seconds, to search for outdated watchers and tables. Set to `0` to disable watcher purging.                                      | `86400` (1 day)   |          |
| `OUTDATED_PURGE_OFFSET`   | Offset, in seconds, to wait before searching for outdated watchers and tables.                                                                | `0`               |          |
| `WATCHER_PURGE_NOTICE`    | Number of seconds to wait before purging outdated watchers after the term has ended. This should be an interval of `OUTDATED_PURGE_INTERVAL`. | `604800` (7 days) |          |

### RateMyProfessors Scraping

| Variable             | Description                                                                                                | Default           | Required |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- | -------- |
| `RMP_FETCH_INTERVAL` | Interval, in seconds, to fetch new RateMyProfessors data. Set to `0` to disable RateMyProfessors fetching. | `604800` (7 days) |          |
| `RMP_FETCH_OFFSET`   | Offset, in seconds, to wait before fetching new Rate My Professors data.                                   | `300` (5 minutes) |          |

### Other

| Variable              | Description                                                                                                        | Default           | Required |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- | -------- |
| `MATH_FETCH_INTERVAL` | Interval, in seconds, to fetch new math course schedule data. Set to `0` to disable math course schedule fetching. | `86400` (1 day)   |          |
| `MATH_FETCH_OFFSET`   | Offset, in seconds, to wait before fetching new math course schedule data.                                         | `32400` (9 hours) |          |

## Discord Bot

| Variable             | Description                                                                               | Default            | Required |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------ | -------- |
| `DISCORD_TOKEN`      | Token of your Discord bot.                                                                |                    | yes\*    |
| `APPLICATION_ID`     | Application ID of your Discord bot.                                                       |                    | yes\*    |
| `PRIMARY_COLOR`      | Hex color code for the primary container color.                                           | `0x065942`         |          |
| `ERROR_COLOR`        | Hex color code for the error container color.                                             | `0xff0000`         |          |
| `SEARCH_PAGE_SIZE`   | Number of search results to show per page of `/search`. Max of `25` due to Discord limit. | `4`                |          |
| `PAGINATION_TIMEOUT` | Number of seconds to wait before expiring a pagination state.                             | `900` (15 minutes) |          |

> \[!NOTE\]
>
> These are only required if you want to run the Discord bot. Omit
> `DISCORD_TOKEN` to skip running the bot.

## Frontend

| Variable                | Description                                                                                              | Default | Required            |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------- | ------------------- |
| `FRONTEND_URL`          | URL with protocol, don't append `/`.                                                                     |         | yes\*               |
| `DISCORD_CLIENT_ID`     | Client ID of your Discord bot, used for Discord OAuth2.                                                  |         | yes\*               |
| `DISCORD_CLIENT_SECRET` | Client secret of your Discord bot, used for Discord OAuth2.                                              |         | yes\*               |
| `JWT_SECRET`            | Secret for generating JWT tokens, used for authentication - technically can be any string but like cmon. |         | highly encouraged\* |

> \[!NOTE\]
>
> These are only required if you want to run a frontend. but like at that point
> you might as well edit the entire backend to fit your frontend needs.
