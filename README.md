# NestJS Config Server

A centralized configuration server built with NestJS. Supports serving config files from local filesystem or a Git repository, with hot reload and optional basic authentication.

## Features

- Serve configuration files for multiple apps and profiles (e.g., `/config/app/dev`)
- Supports two backends: local file and Git repository
- Hot reloads configs on file changes
- Manual refresh from Git
- Optional basic authentication for all endpoints

## How It Works

- Configs are stored as JSON files in a directory (default: `./configs`).
- supports json/yaml/.env etc.
- If `CONFIG_SOURCE=git`, the server clones/pulls a Git repo to fetch configs.
- File changes are watched and configs are reloaded automatically.
- Endpoints are protected with basic auth if enabled via environment variables.

## API Endpoints

### Get Config

`GET /config/:app/:profile`

- Returns the config for the specified app and profile.
- Example: `GET /config/auth-service/dev`

<img width="1557" height="382" alt="config-sever" src="https://github.com/user-attachments/assets/ae672048-3696-4b92-9350-2bcc26500fad" />

### Example Config File

- Included some example configs to showcase it working

```sh
curl http://localhost:3333/config/serviceB/staging
```

```sh
curl http://localhost:3333/config/myapp/dev
```

- Place JSON config files in the config directory (e.g., `./configs/auth-service-dev.json`):

```json
{
  "jwtSecret": "supersecret",
  "expiresIn": 3600
}
```


### Refresh Configs from Git

`POST /config/refresh`

- Manually refreshes configs from the Git repository (if enabled).

## Environment Variables

| Variable             | Description                                      | Default         |
|----------------------|--------------------------------------------------|-----------------|
| CONFIG_SOURCE        | `file` or `git`                                  | file            |
| CONFIG_DIR           | Directory for config files                       | ./configs       |
| CONFIG_GIT_REPO      | Git repo URL (if using git source)               | (none)          |
| CONFIG_GIT_BRANCH    | Branch to use for git source                     | main            |
| AUTH_ENABLED         | Enable basic auth (`true`/`false`)               | false           |
| CONFIG_AUTH_USER     | Username for basic auth                          | (none)          |
| CONFIG_AUTH_PASS     | Password for basic auth                          | (none)          |
| PORT                 | Port to run the server                           | 3333            |

## Usage

1.Install dependencies:

 ```sh
 pnpm install
 ```

2.Set environment variables as needed (see above).

3.Start the server:

 ```sh
 pnpm start
 ```

 Or for development with hot reload:

 ```sh
 pnpm start:dev
 ```

## Project Structure

- `src/main.ts` - Application entrypoint
- `src/app.module.ts` - Main NestJS module
- `src/config/config.module.ts` - Config module
- `src/config/config.service.ts` - Loads and manages configs
- `src/config/config.controller.ts` - API endpoints
- `src/config/auth.guard.ts` - Optional basic authentication

## License

MIT
