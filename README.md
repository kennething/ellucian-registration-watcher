## Backend Setup

1. Select the `backend` directory:

   ```sh
   cd backend
   ```

2. Place the `dev.sqlite3` file in the `backend/server` directory.

3. Create a `.env` file in the `backend` directory:

   ```sh
   BACKEND_URL= # dont append /
   FRONTEND_URL= # dont append /
   PORT= # (optional) defaults to 6969
   NODE_ENV= # (optional) defaults to development, set to production when deploying
   DISCORD_TOKEN= # (optional) can be omitted to only run the server
   APPLICATION_ID= # (optional) can be ommitted if you dont need to register bot commands
   ADMIN_PASSWORD= # (optional) can be ommitted if you dont need the admin routes
   ```

4. Install dependencies:

   ```sh
   npm install
   ```

5. Start the bot and server:

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

## Deploying to DigitalOcean

1. Ensure [ngrok](https://ngrok.com) is installed and set up.

2. Start the server locally:

   ```sh
   npm run serve
   ```

3. Get the prod database from the server by requesting it from `/admin/get-db/:password`:

   ```sh
   curl <PROD_SERVER_URL>/admin/get-db/<ADMIN_PASSWORD> -o prod.sqlite3
   ```

   Place the `prod.sqlite3` file in the `backend/server` directory.

4. Deploy the latest commit to DigitalOcean.

5. Start ngrok to expose your local server:

   ```sh
   ngrok http 6969 # replace with your port if you changed it
   ```

6. Open the console on the DigitalOcean app and get the prod database from your local server:

   ```sh
   wget <NGROK_URL>/admin/get-db/<ADMIN_PASSWORD> -o server/prod.sqlite3
   ```

   Place the `prod.sqlite3` file in the `backend/server` directory.
