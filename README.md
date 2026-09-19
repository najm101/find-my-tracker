# Find My Tracker

[![Publish](https://github.com/najm101/find-my-tracker/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/najm101/find-my-tracker/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/najm101/find-my-tracker?include_prereleases&label=release)](https://github.com/najm101/find-my-tracker/releases)
[![Image](https://img.shields.io/badge/image-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/najm101/find-my-tracker/pkgs/container/find-my-tracker)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
![Status: beta](https://img.shields.io/badge/status-beta-orange)

Self-hosted location history for your **AirTags** and other Apple Find My items. It runs 24/7
as a single Docker container on your home server, with no Mac and no phone app involved.

Apple's Find My app only shows where something is *right now*. Find My Tracker checks Apple's
Find My network on a schedule, keeps every location report in a local database, and shows the
full history on a map.

> [!IMPORTANT]
> **Beta.** It works day to day, but expect rough edges and breaking changes before 1.0. Read the [disclaimer](#%EF%B8%8F-disclaimer) before you sign in
> with your Apple account.

> [!WARNING]
> This project is not affiliated with, endorsed by, or supported by Apple Inc.

|Map: History|Item history (dark)|Near a place|
|----|----|----|
|![Every item's path over a week, in light mode](docs/screenshots/map-history-light.jpg)|![One AirTag's day: bike commute, gym, home](docs/screenshots/history-keys-dark.jpg)|![Which items were near an office, and when](docs/screenshots/places-light.jpg)|

(The location history in these screenshots is not real. It comes from the built-in
[demo mode](#try-it-without-an-apple-account).)

## Why this exists

[OpenTagViewer](https://github.com/parawanderer/OpenTagViewer) showed that you can see your
AirTags outside Apple's ecosystem, and it even saves location history. But it's an Android app,
so the history is only recorded while a background task runs on the phone. If you already have
a home lab or a small always-on server, that job fits better there: this project polls around
the clock, keeps everything in one SQLite file you own, and gives you a web dashboard you can
open from any device.

If you just want to see your AirTags on Android and don't want to run a server, use
OpenTagViewer. It's great.

## Features ⭐

- **Latest location** of every item on a map, with light, dark, streets and satellite styles
- **Full history**: every report Apple returns is stored, deduplicated, and kept indefinitely.
  Apple only keeps about 7 days, so anything older exists only here
- **History view** per item or for all items at once, by preset or custom date range, with
  a day-by-day list of sightings. Arrows show the direction of travel; click a dot to find it
  in the list, or a line to see how long that stretch took
- **Clean history**: a report's position is the position of the stranger's iPhone that heard
  your item, so some land far off. Reports that disagree with the ones around them are hidden
  (one click shows them again), and time spent in one place collapses into a single
  "Stayed here" entry
- **Near a place**: pick a point and a radius and see which items were there, when, and for how
  long
- **Export** any range as CSV or GeoJSON
- **Background polling** every 30 minutes by default (never more often than every 15), plus a
  manual refresh
- **Guided Apple sign-in** in the browser: Apple ID, two-factor code, then the screen-lock
  passcode of one of your Apple devices to unlock the item keys from iCloud Keychain
- **Add items later** without signing in again
- Single admin password, all secrets encrypted at rest, multi-arch image (`amd64`, `arm64`)

## What it works with 🏷️

It reads the items registered to **your** Apple account, the same ones you see in Apple's Find My
app.

| What | Works? | |
| --- | --- | --- |
| **AirTag** | ✅ | What this is built for |
| **Third-party Find My trackers** (Chipolo, Pebblebee, eufy and similar) | ✅ | Should work. They may show up labeled as AirTags |
| **AirPods and other Find My accessories** | ✅ | Where Apple stores a usable key for them. Lightly tested |
| **Your own iPhone, iPad, Mac or Watch** | ⚠️ | Listed, but not selected by default: tracking them tracks a person. Coverage is partial |
| **An item someone shared with you** | ❌ | Only the account that owns an item can read its keys |
| **Tile, Samsung SmartTag, Google Find My Device trackers** | ❌ | Different networks, nothing in common with Apple's |

## ⚠️ Disclaimer

**Read this before you sign in.** By using this software you accept all of the following.

- **Your Apple account could be locked or banned, and that is on you.** This project talks to
  Apple's private, undocumented Find My APIs, the same way FindMy.py and OpenTagViewer do. Apple
  does not allow this and can act on it at any time. Polling more often increases the risk. The
  author and contributors are **not responsible** for anything that happens to your Apple
  account, your devices, or your data. If you can't accept that risk, don't use this.
  Consider using a secondary Apple account if you are worried.
- **Apple can break it at any time.** It relies on reverse-engineered protocols. When Apple
  changes something, it stops working until upstream libraries catch up. There is no guarantee
  it will ever work again.
- **No warranty.** This is beta software provided "as is", without warranty of any kind (see the
  [MIT License](./LICENSE)). Don't rely on it for anything important, such as finding stolen
  property or anything safety-related.
- **Your server holds keys that can locate your items.** The database stores your item keys,
  your Apple session (including your Apple ID password), and iCloud Keychain keys, all encrypted
  with your `SECRET_KEY`. Anyone who gets the `data/` folder **and** `SECRET_KEY` can locate your
  items until you unpair them. Protect both, keep the dashboard on your local network or behind a
  VPN, and use HTTPS if you expose it at all.
- **It appears as a Mac in your Apple account.** Signing in adds one device to your account's
  device list: a MacBook Pro with a serial starting `0FMTRK` (the app shows the full serial). Each
  installation creates this identity once and reuses it, so you get exactly one entry. Removing it
  from your account signs the server out.
- **Only track what you own.** It can only read items registered to the account you sign in with.
  Do not use it to track people without their knowledge and consent. That is illegal in many
  places.

## Quick start 🚀

You need a Linux machine (or anything that runs Docker), and an Apple account with two-factor
authentication, plus the screen-lock passcode of one of your Apple devices (used once, to unlock
the item keys in iCloud Keychain).

```bash
mkdir find-my-tracker && cd find-my-tracker
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/compose.yaml
curl -o .env https://raw.githubusercontent.com/najm101/find-my-tracker/main/.env.example
# edit .env: set SECRET_KEY (openssl rand -base64 48) and ADMIN_PASSWORD
docker compose up -d
```

Open `http://<your-server>:8080`, log in with `ADMIN_PASSWORD`, and follow the sign-in wizard.
The first check runs right away and brings in about the last 7 days of history.

### Image tags

Images are published to `ghcr.io/najm101/find-my-tracker` for `linux/amd64` and `linux/arm64`.

| Tag | What it is |
| --- | --- |
| `latest` | The newest release. Use this |
| `0.3.0`, `0.3` | A specific release, if you want to pin |
| `edge` | Built from every push to `main`, including changes not yet released |

To update: `docker compose pull && docker compose up -d`. Database migrations run automatically
on startup.

### Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SECRET_KEY` | yes | | At least 32 characters. Encrypts the stored keys and signs the login cookie. **Back it up with `data/`.** Changing it makes stored keys unreadable |
| `ADMIN_PASSWORD` | yes | | Dashboard password (at least 8 characters) |
| `DATABASE_URL` | no | SQLite in `data/` | A PostgreSQL database instead, e.g. `postgresql://user:password@host:5432/tracker`. The schema is created on first start. There is no migration from an existing SQLite database |
| `ANISETTE_URL` | no | built-in | An external [anisette](https://github.com/Dadoum/anisette-v3-server) server, only if the built-in provider stops working |
| `PORT` | no | `8080` | |
| `LOG_LEVEL` | no | `INFO` | |
| `DEMO_MODE` | no | `false` | Fake Apple account with demo data. See below |

### Backups

Everything lives in the mounted `data/` folder (`tracker.db` plus an anisette cache). Back up
that folder together with your `SECRET_KEY`. With `DATABASE_URL` set, back up that database
instead (`pg_dump`); `data/` then only holds the anisette cache.

## Try it without an Apple account

Set `DEMO_MODE=true` and the server talks to a fake Apple instead of the real one. In the wizard,
use any Apple ID and password, the code `123456`, and the passcode `1234`. You get five items
following two weeks of made-up routines around Amsterdam (bike commutes, a train day trip to
Haarlem, a weekend in Lisbon). Real Apple servers are never contacted in demo mode.

```bash
docker run --rm -p 8080:8080 -e DEMO_MODE=true \
  -e SECRET_KEY="$(openssl rand -base64 48)" -e ADMIN_PASSWORD=demodemo \
  ghcr.io/najm101/find-my-tracker:latest
```

## How it works

```
one container: uvicorn → FastAPI
  ├─ /api/*     JSON API (admin cookie session)
  ├─ /*         the React dashboard (static build)
  └─ poller     background task: fetch reports from Apple → SQLite
/data           tracker.db (SQLite, WAL) + anisette cache
```

The Apple side is handled by [FindMy.py](https://github.com/malmeloo/FindMy.py). The wizard signs
in, unlocks the item keys from iCloud Keychain, and stores them encrypted. From then on, the
poller asks Apple for the encrypted location reports of each item, decrypts them locally, and
stores them. Apple never sees your decrypted locations. Only this server does.

## Development

Requirements: [uv](https://docs.astral.sh/uv/), Node ≥ 22.22, pnpm.

```bash
# API on :8080
cd server
uv sync
SECRET_KEY=$(openssl rand -base64 48) ADMIN_PASSWORD=devpassword DATA_DIR=../data/dev \
  DEMO_MODE=true uv run python -m find_my_tracker

# Web on :5173 (proxies /api to :8080)
cd web
pnpm install
pnpm dev
```

Checks (the same ones CI runs):

```bash
cd server && uv run ruff check . && uv run ruff format --check . && uv run basedpyright && uv run pytest
cd web && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

```
server/   FastAPI + poller (Python 3.14, feature-first: src/find_my_tracker/features/*)
web/      React Router SPA + shadcn/ui (feature-first: app/features/*)
```

After changing the API, regenerate the schema and the web types:
`cd server && uv run python -m find_my_tracker.openapi > openapi.json && cd ../web && pnpm api:types`.

Tests never call Apple. They use a fake Apple client with known answers. Issues and pull
requests are welcome.

### Releasing

Releases are automatic. Every push to `main` runs the checks and publishes the `edge` image.
When the `version` in `server/pyproject.toml` has no matching `v<version>` tag yet, the same run
also publishes `<version>`, `<major>.<minor>` and `latest`, tags the commit, and creates the
GitHub Release. To ship a new version, bump that number (for example `0.1.0` → `0.1.1`) and push.

## Credits 🙏

- [**OpenTagViewer**](https://github.com/parawanderer/OpenTagViewer) by parawanderer: the
  Android app that inspired this project, and the source of much of what I know about how this
  works
- [**FindMy.py**](https://github.com/malmeloo/FindMy.py) by malmeloo and contributors: does all
  the actual talking to Apple. This project currently uses
  [parawanderer's fork](https://github.com/parawanderer/FindMy.py) for iCloud Keychain export
- [**OpenHaystack**](https://github.com/seemoo-lab/openhaystack) by SEEMOO Lab: the research
  that made all of this possible
- [anisette-v3-server](https://github.com/Dadoum/anisette-v3-server) by Dadoum, the optional
  external anisette provider
- [shadcn/ui](https://ui.shadcn.com), [mapcn](https://mapcn.dev) and
  [MapLibre GL JS](https://maplibre.org) for the dashboard
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, served by
  [OpenFreeMap](https://openfreemap.org). Satellite imagery by Esri
- Built with a lot of help from [Claude](https://claude.ai) (Anthropic) as a coding assistant

## License

[MIT](./LICENSE), same as OpenTagViewer and FindMy.py. Do what you like with it, but read the
[disclaimer](#%EF%B8%8F-disclaimer) first.
