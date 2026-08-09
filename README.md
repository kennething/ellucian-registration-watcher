## Backend Setup

1. Ensure [Node.js](https://nodejs.org) is installed

2. Select the `backend` directory:

   ```sh
   cd backend
   ```

3. Place the `db.sqlite3` file in the `backend/server` directory.

4. Create a `.env` file in the `backend` directory:

   ```sh
   BACKEND_URL= # dont append /
   FRONTEND_URL= # dont append /

   PORT= # (optional) defaults to 6969
   NODE_ENV= # (optional) defaults to development, set to production when deploying

   DISCORD_TOKEN= # (optional) can be omitted to only run the server
   DISCORD_CLIENT_ID= # required if running bot
   DISCORD_CLIENT_SECRET= # required if running bot
   APPLICATION_ID= # required if running bot
   JWT_SECRET= # required if running frontend
   ```

5. Install dependencies:

   ```sh
   npm install
   ```

6. Start the bot and server:

   ```sh
   npm run serve
   ```

   If you don't have a `DISCORD_TOKEN` set, this will only start the server. Anything on the server that requires a bot client will not work.

## Registering Bot Commands

1. Ensure you have a `APPLICATION_ID` in your `.env` file.

2. Register the commands:

   ```sh
   npm run deploy
   ```

You only need to register commands if you change the command's data. Changing the command's behavior (i.e. editing the `execute` function) does not require re-registering.

## Unregistering Bot Commands

1. Ensure you have a `APPLICATION_ID` in your `.env` file.

2. Unregister the commands:

   ```sh
   npm run undeploy
   ```
