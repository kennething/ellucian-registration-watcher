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

5. Create redirect URLs to `<BACKEND_URL>/auth/discord/callback` and
   `<BACKEND_URL>/auth/discord/bot/callback` (with your backend URL replaced).

6. Go to `<BACKEND_URL>/auth/discord` and you can add your bot!

## Run the server

1. Install [Node.js](https://nodejs.org)

2. Place a `db.sqlite3` SQLite3 database file in the `/server` directory.
   See [here](./README.md#database) for more info on the database schema.

3. Create a `.env` file in the root directory. See
   [here](./README.md#environment-variables) for config options.

4. Install dependencies:

   ```sh
   npm install
   ```

5. Start the bot and/or server:

   ```sh
   npm run serve
   ```

# Bot Commands

`APPLICATION_ID` must be defined in your `.env` in order to deploy/undeploy
commands.

## Registering

1. Register the commands:

   ```sh
   npm run deploy
   ```

You only need to register commands if you change the command's data. Changing
the command's behavior (i.e. editing the `execute` function) does not require
re-registering.

## Unregistering

2. Unregister the commands:

   ```sh
   npm run undeploy
   ```

# Environment Variables

## General

| Variable               | Description                                                                                                                                          | Default               | Required |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| `BACKEND_URL`          | URL with protocol, don't append `/`                                                                                                                  |                       | yes      |
| `PORT`                 | Port to run the server on                                                                                                                            | `6969`                |          |
| `DATABASE_PATH`        | Path to the SQLite database file                                                                                                                     | `./server/db.sqlite3` |          |
| `BACKUP_DATABASE_PATH` | Path to a folder where the database will be backed up before watchers are purged                                                                     | `./server/`           |          |
| `BANNER_API_URL`       | URL with protocol to your university's course catalog, don't append `/` (ex. `https://ssb.cc.binghamton.edu:8484`, `https://banssb.yourcollege.edu`) |                       | yes      |
| `RMP_SCHOOL_ID`        | ID of your school on [Rate My Professors](https://www.ratemyprofessors.com) - find this by searching for your school and looking at the URL          |                       |          |
| `MATH_SCHEDULE_URL`    | You probably don't have this but the URL to the math course schedule for your school, don't append `/`                                               |                       |          |
| `USER_WATCHER_LIMIT`   | Maximum number of watchers a user can create                                                                                                         | 67                    |          |
| `USER_SCHEDULE_LIMIT`  | Maximum number of schedules a user can create                                                                                                        | 5                     |          |

## Automation

| Variable                    | Description                                                                                                                                  | Default                    | Required |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| `NOTIFICATION_COOLDOWN`     | Cooldown, in seconds, to wait before sending another notification for the same watcher to the same user                                      | `43200` (12 hours)         |          |
| `CLASS_FETCH_INTERVAL`      | Interval, in seconds, to fetch new class data. Set to `0` to disable class fetching.                                                         | `600` (10 minutes)         |          |
| `CLASS_FETCH_OFFSET`        | Offset, in seconds, to wait before fetching new class data                                                                                   | `50`                       |          |
| `CLASS_HISTORY_24H_ENTRIES` | Number of entries to log in the class history over the last 24 hours. This should be an interval of `CLASS_FETCH_INTERVAL`.                  | `72` (once per 20 minutes) |          |
| `CLASS_HISTORY_28D_ENTRIES` | Number of entries to log in the class history over the last 28 days. This should be an interval of `CLASS_FETCH_INTERVAL`.                   | `28` (once per 1 day)      |          |
| `WATCHER_PURGE_INTERVAL`    | Interval, in seconds, to search for outdated watchers. Set to `0` to disable watcher purging.                                                | `86400` (1 day)            |          |
| `WATCHER_PURGE_OFFSET`      | Offset, in seconds, to wait before searching for outdated watchers                                                                           | `0`                        |          |
| `WATCHER_PURGE_NOTICE`      | Number of seconds to wait before purging outdated watchers after the term has ended. This should be an interval of `WATCHER_PURGE_INTERVAL`. | `604800` (7 days)          |          |
| `RMP_FETCH_INTERVAL`        | Interval, in seconds, to fetch new RateMyProfessors data. Set to `0` to disable RateMyProfessors fetching.                                   | `604800` (7 days)          |          |
| `RMP_FETCH_OFFSET`          | Offset, in seconds, to wait before fetching new Rate My Professors data                                                                      | `300` (5 minutes)          |          |
| `MATH_FETCH_INTERVAL`       | Interval, in seconds, to fetch new math course schedule data. Set to `0` to disable math course schedule fetching.                           | `86400` (1 day)            |          |
| `MATH_FETCH_OFFSET`         | Offset, in seconds, to wait before fetching new math course schedule data                                                                    | `32400` (9 hours)          |          |

## Discord Bot

| Variable             | Description                                                  | Default    | Required |
| -------------------- | ------------------------------------------------------------ | ---------- | -------- |
| `DISCORD_TOKEN`      | Token of your Discord bot                                    |            | yes\*    |
| `APPLICATION_ID`     | Application ID of your Discord bot                           |            | yes\*    |
| `PRIMARY_COLOR`      | Hex color code for the primary container color               | `0x065942` |          |
| `ERROR_COLOR`        | Hex color code for the error container color                 | `0xff0000` |          |
| `SEARCH_PAGE_SIZE`   | Number of search results to show per page of `/search`       | `4`        |          |
| `PAGINATION_TIMEOUT` | Number of seconds to wait before expiring a pagination state | `900`      |          |

> \[!NOTE\]
>
> These are only required if you want to run the Discord bot. Omit
> `DISCORD_TOKEN` to skip running the bot.

## Frontend

| Variable                | Description                                                                                             | Default | Required |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `FRONTEND_URL`          | URL with protocol, don't append `/`                                                                     |         | yes\*    |
| `DISCORD_CLIENT_ID`     | Client ID of your Discord bot, used for Discord OAuth2                                                  |         | yes\*    |
| `DISCORD_CLIENT_SECRET` | Client secret of your Discord bot, used for Discord OAuth2                                              |         | yes\*    |
| `JWT_SECRET`            | Secret for generating JWT tokens, used for authentication - technically can be any string but like cmon |         | yes\*    |

> \[!NOTE\]
>
> These are only required if you want to run a frontend. but like at that point
> you might as well edit the entire backend to fit your frontend needs.

# Database

You can adapt your database to fit your needs better, but here is the schema for
the database used by Bad Scheduler:

### `users` table

| Name         | Data type |
| ------------ | --------- |
| `uuid`       | `TEXT`    |
| `discord_id` | `TEXT`    |

### `watchers` table

| Name                | Data type | Notes                     |
| ------------------- | --------- | ------------------------- |
| `uuid`              | `TEXT`    |                           |
| `owner_uuid`        | `TEXT`    |                           |
| `last_notified`     | `INTEGER` | unix timestamp in seconds |
| `term_id`           | `TEXT`    |                           |
| `crn`               | `TEXT`    |                           |
| `notify_when`       | `INTEGER` |                           |
| `notify_when_value` | `INTEGER` |                           |

### `schedules` table

| Name         | Data type | Notes                         |
| ------------ | --------- | ----------------------------- |
| `uuid`       | `TEXT`    |                               |
| `owner_uuid` | `TEXT`    |                               |
| `name`       | `TEXT`    |                               |
| `term_id`    | `TEXT`    |                               |
| `crns`       | `TEXT`    | JSON-serialized array of CRNs |

### `professors` table

| Name                  | Data type | Notes                                                  |
| --------------------- | --------- | ------------------------------------------------------ |
| `school_id`           | `INTEGER` | not consistent across multiple fetches for some reason |
| `school_name`         | `TEXT`    |                                                        |
| `rmp_id`              | `INTEGER` |                                                        |
| `rmp_name`            | `TEXT`    |                                                        |
| `overall_rating`      | `REAL`    |                                                        |
| `num_ratings`         | `INTEGER` |                                                        |
| `percent_take_again`  | `REAL`    |                                                        |
| `level_of_difficulty` | `REAL`    |                                                        |

### `course_history` table

| Name            | Data type | Notes                            |
| --------------- | --------- | -------------------------------- |
| `crn`           | `TEXT`    |                                  |
| `term_id`       | `TEXT`    |                                  |
| `24h_timestamp` | `INTEGER` | unix timestamp in seconds        |
| `28d_timestamp` | `INTEGER` | unix timestamp in seconds        |
| `seat_24h`      | `TEXT`    | JSON-serialized array of numbers |
| `seat_28d`      | `TEXT`    | JSON-serialized array of numbers |
| `wait_24h`      | `TEXT`    | JSON-serialized array of numbers |
| `wait_28d`      | `TEXT`    | JSON-serialized array of numbers |
