# Find My Tracker

[![Publish](https://github.com/najm101/find-my-tracker/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/najm101/find-my-tracker/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/najm101/find-my-tracker?include_prereleases&label=release)](https://github.com/najm101/find-my-tracker/releases)
[![Image](https://img.shields.io/badge/image-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/najm101/find-my-tracker/pkgs/container/find-my-tracker)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
![Status: beta](https://img.shields.io/badge/status-beta-orange)

Location history for your **AirTags** and other Apple Find My items, on your own server. One
Docker container, running 24/7. No Mac, no phone app.

Apple's Find My only shows where something is right now. This checks Apple's network on a
schedule, keeps every report in a database, and puts the whole history on a map.

> [!IMPORTANT]
> **Expect gaps.** Apple only gets reports for an item while it's away from your own Apple
> devices. An AirTag in your pocket next to your iPhone goes quiet, so nobody reports it. You'll
> get good history for trips and for things you left somewhere, and not much for the hours
> they're with you. A server can't fix that.

> [!WARNING]
> **Beta.** I use it every day, but expect rough edges and breaking changes before 1.0. It's not
> affiliated with Apple in any way. Read the [disclaimer](#disclaimer) before you sign in.

|Map: History|Item history (dark)|Near a place|
|----|----|----|
|![Every item's path over a week, in light mode](docs/screenshots/map-history-light.jpg)|![One AirTag's day: bike commute, gym, home](docs/screenshots/history-keys-dark.jpg)|![Which items were near an office, and when](docs/screenshots/places-light.jpg)|

(The screenshots use made-up history from [demo mode](#try-it-without-an-apple-account).)

## What you get

- Every item's latest location, plus its full history. Apple keeps about 7 days; this keeps
  everything, or as long as you pick in Settings (30 days to 2 years). An item's last known
  position is never deleted.
- A history view per item or for all of them, with playback like a video.
- **Predicted routes** (optional): the roads an item probably took between reports, instead of
  straight lines. See [below](#predicted-routes).
- Stray reports hidden, and time spent in one place collapsed into one "Stayed here".
- **Near a place**: which items were inside a circle, when, and for how long.
- CSV and GeoJSON export, a status page for every check, and a guided Apple sign-in in the browser.
- Optional two-factor login, a hashed password, rate-limited logins and a strict CSP. Keys and the
  Apple session are encrypted at rest.

Inspired by [OpenTagViewer](https://github.com/parawanderer/OpenTagViewer). If you just want your
AirTags on Android without running a server, use that. It's great.

## What it works with

It reads the items on **your** Apple account, the same list you see in Find My.

| What | Works? | |
| --- | --- | --- |
| **AirTag** | ✅ | What it's built for |
| **Third-party Find My trackers** (Chipolo, Pebblebee, eufy…) | ✅ | May show as AirTags |
| **AirPods and other Find My accessories** | ✅ | Lightly tested |
| **Your own iPhone, iPad, Mac or Watch** | ⚠️ | Listed, off by default (tracking them tracks a person) |
| **An item someone shared with you** | ❌ | Only the owner's account can read its keys |
| **Tile, SmartTag, Google trackers** | ❌ | Different networks |

Sharing an item you own with someone actually helps. It's separated from *your* devices, so it
keeps broadcasting, with their iPhone right next to it.

## Disclaimer

**Read this before you sign in.** Using it means you accept all of this:

- **Your Apple account could get locked or banned, and that's on you.** It talks to Apple's
  private Find My APIs, same as FindMy.py and OpenTagViewer. Apple doesn't allow it. Polling more
  often raises the risk. Use a second Apple account if you're worried.
- **It's not a safety product.** Don't use it to watch a child or anyone whose safety depends on
  it, or in an emergency. Coverage has holes, it lags 30 minutes or more, and Apple can break it
  overnight.
- **No warranty.** It's provided "as is" (see the [MIT License](./LICENSE)).
- **Your server holds keys that can locate your items.** They're encrypted with `SECRET_KEY`, but
  anyone with `data/` **and** that key can find your items. Location history itself isn't
  encrypted. Protect both.
- **It shows up as one MacBook Pro in your Apple account**, with a serial starting `0FMTRK`.
  Removing it signs the server out.
- **Only track what you own.** Tracking people without consent is illegal in a lot of places.

## Quick start

You need Docker, an Apple account with two-factor on, and the screen-lock passcode of one of your
Apple devices (used once, to unlock the item keys from iCloud Keychain).

```bash
mkdir find-my-tracker && cd find-my-tracker
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/compose.yaml
curl -o .env https://raw.githubusercontent.com/najm101/find-my-tracker/main/.env.example
# edit .env: set SECRET_KEY (openssl rand -base64 48) and ADMIN_PASSWORD
docker compose up -d
```

Open `http://<your-server>:8080`, log in with `ADMIN_PASSWORD`, and follow the wizard. The first
check runs right away and pulls about 7 days of history.

It binds to `127.0.0.1` only. From another machine, use SSH (`ssh -L 8080:127.0.0.1:8080
you@server`), a VPN, or a reverse proxy.

Images are `ghcr.io/najm101/find-my-tracker` for `amd64` and `arm64`. Use `latest`, pin a release
(`0.8.0`, `0.8`), or `edge` for every push to `main`. To update: `docker compose pull && docker
compose up -d`. Migrations run on their own.

### Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | required | 32+ characters. Encrypts everything stored and signs the cookie. **Back it up with `data/`.** Change it and the stored keys are gone |
| `ADMIN_PASSWORD` | first start | 12+ characters. Only seeds the password on first start; after that you change it in Settings |
| `ADMIN_PASSWORD_RESET` | `false` | Start once with this and `ADMIN_PASSWORD` to reset a lost password. Then turn it off |
| `DATABASE_URL` | SQLite in `data/` | PostgreSQL instead, e.g. `postgresql://user:password@host:5432/tracker`. No migration from SQLite |
| `ANISETTE_URL` | built in | An external [anisette](https://github.com/Dadoum/anisette-v3-server) server, if the built-in one breaks |
| `PORT` / `LOG_LEVEL` | `8080` / `INFO` | |
| `DEMO_MODE` | `false` | Fake Apple with demo data |
| `ROUTING_URL` | | Your own [Valhalla](https://github.com/valhalla/valhalla) server for predicted routes. Locks the choice in Settings |
| `ROUTING_BUILD_THREADS` | `2` | Threads for preparing map data. More is faster and needs more memory |

Only once the internet can reach it:

| Variable | Default | Notes |
| --- | --- | --- |
| `FORCE_HTTPS` | `false` | Marks the cookie `Secure` and sends HSTS. **Set it whenever you serve over HTTPS** |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | Whose `X-Forwarded-*` headers to believe. Behind a proxy container, set its address (or `*`), or every visitor shares one login rate limit |
| `ALLOWED_HOSTS` | any | Host names to answer to. Everything else gets a 400 |
| `COOKIE_SAMESITE` | `strict` | `lax` if links from other sites should keep you signed in |
| `EXTRA_CSP_SOURCES` | | Extra map tile origins |

Back up `data/` together with `SECRET_KEY`. With `DATABASE_URL`, back up the database
(`pg_dump`) instead.

## Predicted routes

A report is where a stranger's phone was when it heard your item. So a drive drawn report to report
cuts across blocks. Predicted routes snap it to the roads it most likely took (map matching), and
drop reports no road comes near.

It's a guess. On main roads with a report every few minutes it's usually right. In simulated drives
around Cairo, 84% of the predicted route was on the road actually driven, against 15% for straight
lines. Gaps over 30 minutes stay dashed.

Turn it on in **Settings → Predicted routes**:

- **Built in.** The server downloads [OpenStreetMap](https://www.openstreetmap.org) data from
  [Geofabrik](https://download.geofabrik.de) for the countries your items visit and runs Valhalla
  inside the container. Preparing a region takes a minute or 2 and about 2 GB of memory (Egypt:
  178 MB download, 740 MB of road data). Low on memory? Set `ROUTING_BUILD_THREADS=1`. Only the map
  download leaves your server.
- **Your own Valhalla.** Point `ROUTING_URL` at it:

```yaml
services:
  valhalla:
    image: ghcr.io/valhalla/valhalla-scripted:3.9.0
    environment:
      tile_urls: https://download.geofabrik.de/africa/egypt-latest.osm.pbf
    volumes:
      - ./valhalla:/custom_files
    restart: unless-stopped

  find-my-tracker:
    environment:
      ROUTING_URL: http://valhalla:8002
```

After its first start, set `"breakage_distance": 100000` under `meili.default` in
`valhalla/valhalla.json` and restart it. Without that, reports more than 2 km apart won't connect.

An item that lives in a car? Turn on **Lives in a vehicle** for it in **Settings → Items**.

## Putting it on the internet

Honestly, a VPN ([Tailscale](https://tailscale.com), [WireGuard](https://www.wireguard.com)) is
the safest way to reach it from outside. Nothing exposed, nothing to renew. If you still want it
on a public URL:

**1. Turn on two-factor.** Settings → Security → **Set up authenticator app**. Keep the recovery
codes somewhere other than that phone. And use a long password you don't use anywhere else.

**2. Serve it over HTTPS.** With [DuckDNS](https://www.duckdns.org) pointing at your home IP, add
this to `.env`:

```bash
DOMAIN=yourname.duckdns.org
ACME_EMAIL=you@example.com
```

```bash
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/compose.internet.yaml
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/Caddyfile
docker compose -f compose.yaml -f compose.internet.yaml up -d
```

Forward ports 80 and 443 to this machine, nothing else. Caddy handles the certificate.

Using your own proxy (nginx, Traefik, Dokploy)? Set `FORCE_HTTPS=true`, `TRUSTED_PROXIES` and
`ALLOWED_HOSTS`. Skip the first two and one attacker hammering the login page locks *you* out too.

**3. Encrypt the disk.** Location history isn't encrypted in the database, so put `data/` (or
Postgres's volume) on an encrypted disk, LUKS or ZFS. Encrypt your backups too:

```bash
pg_dump "$DATABASE_URL" | age -r age1yourkey... > tracker-$(date +%F).sql.age
```

A DuckDNS name gets scanned within hours. Failed logins are limited to 5 per IP per 5 minutes, and
Settings → Security shows every attempt. If you think a cookie leaked, **Sign out everywhere**.

## Try it without an Apple account

With `DEMO_MODE=true` the server talks to a fake Apple. Use any Apple ID and password, code
`123456`, passcode `1234`. You get 5 items and 2 weeks of made-up routines around Amsterdam.

```bash
docker run --rm -p 8080:8080 -e DEMO_MODE=true \
  -e SECRET_KEY="$(openssl rand -base64 48)" -e ADMIN_PASSWORD=demodemo \
  ghcr.io/najm101/find-my-tracker:latest
```

## Contributing

Running from source, the layout and CI are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Issues
and PRs are welcome.

## Credits

- [**OpenTagViewer**](https://github.com/parawanderer/OpenTagViewer) by parawanderer: the app that
  got me started, and most of what I know about how this works
- [**FindMy.py**](https://github.com/malmeloo/FindMy.py) by malmeloo: does all the talking to Apple
  (this uses [parawanderer's fork](https://github.com/parawanderer/FindMy.py) for Keychain export)
- [**OpenHaystack**](https://github.com/seemoo-lab/openhaystack) by SEEMOO Lab, the research behind
  all of it, and [anisette-v3-server](https://github.com/Dadoum/anisette-v3-server) by Dadoum
- [shadcn/ui](https://ui.shadcn.com), [mapcn](https://mapcn.dev) and
  [MapLibre GL JS](https://maplibre.org). Map data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors via
  [OpenFreeMap](https://openfreemap.org); satellite imagery by Esri
- Built with a lot of help from [Claude](https://claude.ai)

## License

[MIT](./LICENSE). Do what you like with it, but read the [disclaimer](#disclaimer) first.
