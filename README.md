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
> **Expect gaps in the history.** Apple's network only reports an item while it is *away* from
> your own Apple devices. An AirTag sitting next to your iPhone is connected to it, not
> separated, so it stops broadcasting altogether and no passing iPhone can report it. You get
> good history for trips and for items you have left somewhere, and thin or empty history for
> the hours an item spends with you. Nothing running on a server can close that gap: it needs a
> device physically near the item, which is how Apple's own Find My app hides it.

> [!WARNING]
> **Beta.** It works day to day, but expect rough edges and breaking changes before 1.0. This
> project is not affiliated with, endorsed by, or supported by Apple Inc. Read the
> [disclaimer](#%EF%B8%8F-disclaimer) before you sign in with your Apple account.

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

The two are complementary rather than rivals. A phone in your pocket can hear an item over
Bluetooth and place it when Apple's network says nothing — the gap above — and OpenTagViewer
1.1.0 does exactly that. A server can't, but it never sleeps, never runs out of battery and
never misses a week because you forgot to open an app. If you just want to see your AirTags on
Android and don't want to run a server, use OpenTagViewer. It's great.

## Features ⭐

- **Latest location** of every item on a map, with light, dark, streets and satellite styles
- **Full history**: every report Apple returns is stored, deduplicated, and kept indefinitely.
  Apple only keeps about 7 days, so anything older exists only here. It is a record of where
  your items were *seen*, not a continuous track
- **History view** per item or for all items at once, from the last hour to the last 30 days,
  or any days and times you pick; arrows step to the window before or after. A day-by-day list
  of sightings sits beside it. Arrows on the map show the direction of travel; click a dot to
  find it in the list, or a line to see how long that stretch took
- **Playback**: play any window back on the map like a video. The marker moves from report to
  report while the path fills in behind it; drag the scrubber to jump around, step report by
  report, or change the speed. Movement plays in about half a minute, and stays and stretches
  without reports are fast-forwarded
- **Predicted routes** (optional): the roads an item most likely took between its reports,
  instead of straight lines. Show them over the reported path, or on their own; playback follows
  them. Runs on your own server, on map data it downloads for the places your items go. A long
  history takes a while the first time: the path button fills up as its trips are worked out,
  each trip is drawn on the map as soon as it's done, and the map, timeline and playback work
  meanwhile. See [Predicted routes](#predicted-routes)
- **Clean history**: a report's position is the position of the stranger's iPhone that heard
  your item, so some land far off. Reports that disagree with the ones around them are hidden
  (one click shows them again), and time spent in one place collapses into a single
  "Stayed here" entry
- **Near a place**: pick a point and a radius and see which items were there, when, and for how
  long
- **Export** any range as CSV or GeoJSON
- **Background polling** every 30 minutes by default, or as rarely as once a week if you only
  need the history (say, as a backup to a car's own GPS), plus a manual refresh. A check that
  fails is retried within the hour
- **Guided Apple sign-in** in the browser: Apple ID, two-factor code, then the screen-lock
  passcode of one of your Apple devices to unlock the item keys from iCloud Keychain
- **Add items later** without signing in again
- **Settings page**: check interval (with a warning below the recommended 30 minutes), rename
  items, give them an emoji and a colour, pause one without losing its history, or remove it
- **Status page**: every check the server has made, what it found, and the error when one
  fails — so a quiet map can be told apart from a broken one
- **Built to be exposed, carefully**: optional two-factor authentication with an
  authenticator app and single-use recovery codes, an argon2-hashed password you change from
  Settings, "sign out everywhere", a log of recent sign-in attempts, rate-limited logins, a
  strict Content-Security-Policy and a worked HTTPS setup. See
  [Putting it on the internet](#putting-it-on-the-internet-)
- Beacon keys, Apple session and two-factor secret encrypted at rest; multi-arch image
  (`amd64`, `arm64`)

## What it works with 🏷️

It reads the items registered to **your** Apple account, the same ones you see in Apple's Find My
app.

| What | Works? | |
| --- | --- | --- |
| **AirTag** | ✅ | What this is built for |
| **Third-party Find My trackers** (Chipolo, Pebblebee, eufy and similar) | ✅ | May show up labeled as AirTags |
| **AirPods and other Find My accessories** | ✅ | Where Apple stores a usable key. Lightly tested |
| **Your own iPhone, iPad, Mac or Watch** | ⚠️ | Listed, not selected by default: tracking them tracks a person. Coverage is partial |
| **An item someone shared with you** | ❌ | Only the account that owns an item can read its keys |
| **Tile, Samsung SmartTag, Google Find My Device trackers** | ❌ | Different networks, nothing in common with Apple's |

Sharing an item *you own* with someone in Find My doesn't get in the way, and usually helps. The
silence described above applies only to devices on **your** Apple account, so an item travelling
with the person you shared it with is separated, broadcasting, and reported normally — with a
guaranteed iPhone right beside it the whole way.

## ⚠️ Disclaimer

**Read this before you sign in.** By using this software you accept all of the following.

- **Your Apple account could be locked or banned, and that is on you.** This project talks to
  Apple's private, undocumented Find My APIs, the same way FindMy.py and OpenTagViewer do. Apple
  does not allow this and can act on it at any time. Polling more often increases the risk. The
  author and contributors are **not responsible** for anything that happens to your Apple
  account, your devices, or your data. If you can't accept that risk, don't use this.
  Consider using a secondary Apple account if you are worried.
- **Not a safety product.** Do not use this to keep track of a child, an elderly relative, or
  anyone whose safety depends on it, and do not rely on it in an emergency, to find stolen
  property, or for anything else that matters. Location comes from strangers' phones happening
  to walk past your item: coverage has holes, it is street-level at best, it lags by 30 minutes
  or more, it goes quiet whenever the item is near you, and Apple can break the whole thing
  overnight. If someone's safety is involved, buy a product built and supported for that.
- **Apple can break it at any time.** It relies on reverse-engineered protocols. When Apple
  changes something, it stops working until upstream libraries catch up. There is no guarantee
  it will ever work again.
- **No warranty.** This is beta software provided "as is", without warranty of any kind (see the
  [MIT License](./LICENSE)).
- **Your server holds keys that can locate your items.** The database stores your item keys,
  your Apple session (including your Apple ID password), and iCloud Keychain keys, all encrypted
  with your `SECRET_KEY`. Anyone who gets the `data/` folder **and** `SECRET_KEY` can locate your
  items until you unpair them. Your location history is stored unencrypted, so anyone who gets
  the database reads it. Protect both, and if the dashboard is reachable from outside your
  network, read [Putting it on the internet](#putting-it-on-the-internet-) before you open it up.
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

The app binds to `127.0.0.1` only. From another machine on your network, reach it over SSH
(`ssh -L 8080:127.0.0.1:8080 you@server`), a VPN, or a reverse proxy. To reach it from
outside your home, read [Putting it on the internet](#putting-it-on-the-internet-) first.

Images are published to `ghcr.io/najm101/find-my-tracker` for `linux/amd64` and `linux/arm64`.
Use `latest`, or pin a release (`0.3.1`, `0.3`); `edge` is built from every push to `main`. To
update: `docker compose pull && docker compose up -d`. Migrations run automatically on startup.

### Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SECRET_KEY` | yes | | At least 32 characters. Encrypts the stored keys, the Apple session and your two-factor secret, and signs the login cookie. **Back it up with `data/`.** Changing it makes stored keys unreadable |
| `ADMIN_PASSWORD` | first start | | Dashboard password; use at least 12 characters. Seeds the password on the **first start only**; after that it lives hashed in the database and is changed in Settings, and this can be removed. A shorter one still starts (so an upgrade never locks you out) but logs a warning |
| `ADMIN_PASSWORD_RESET` | no | `false` | Start once with this and `ADMIN_PASSWORD` set to overwrite a password you have lost. Turn it off again afterwards |
| `DATABASE_URL` | no | SQLite in `data/` | A PostgreSQL database instead, e.g. `postgresql://user:password@host:5432/tracker`. The schema is created on first start. There is no migration from an existing SQLite database |
| `ANISETTE_URL` | no | built-in | An external [anisette](https://github.com/Dadoum/anisette-v3-server) server, only if the built-in provider stops working |
| `PORT` | no | `8080` | |
| `LOG_LEVEL` | no | `INFO` | |
| `DEMO_MODE` | no | `false` | Fake Apple account with demo data. See below |
| `ROUTING_URL` | no | | A [Valhalla](https://github.com/valhalla/valhalla) server for predicted routes, e.g. `http://valhalla:8002`. Set here, Settings shows it and can't change it. Unset: choose in Settings. See [Predicted routes](#predicted-routes) |
| `ROUTING_BUILD_THREADS` | no | `2` | Threads the built-in routing engine uses to prepare map data. More is faster and needs more memory |

These only matter once something outside your network can reach the dashboard:

| Variable | Default | Notes |
| --- | --- | --- |
| `FORCE_HTTPS` | `false` | TLS is terminated by a proxy in front, so the app only ever sees plain HTTP. Set this and the session cookie is marked `Secure` and HSTS is sent. **Set it whenever you serve over HTTPS** |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | Whose `X-Forwarded-For` and `-Proto` to believe. A proxy in another container is not `127.0.0.1`, and without this every visitor shares one login rate-limit bucket. Your proxy's address, or `*` when nothing else can reach the app's port |
| `ALLOWED_HOSTS` | any | Comma-separated host names to answer to. Anything else gets a 400 |
| `COOKIE_SAMESITE` | `strict` | `lax` if following a link to the dashboard from another site should keep you signed in. `strict` is the safer default |
| `EXPOSE_API_DOCS` | `false` | Serve `/docs`, `/redoc` and `/openapi.json`. Off by default: it is a map of the API for anyone who finds the address |
| `EXTRA_CSP_SOURCES` | | Extra origins the browser may load map tiles from, comma-separated |

Everything lives in the mounted `data/` folder (`tracker.db` plus an anisette cache): back it up
together with your `SECRET_KEY`. With `DATABASE_URL` set, back up that database instead
(`pg_dump`), and `data/` then only holds the anisette cache.

## Predicted routes

A report is where a stranger's phone was when it heard your item, so a drive drawn report to
report cuts across blocks, and a phone on the road next to yours puts your car on a side street.
Predicted routes snap the history to the roads it most likely took. This is called *map matching*,
and it uses every report on a trip as evidence rather than as a stop. So one stray report doesn't
drag the route down a side street and back; a report no road comes near is left off and shown as
a hollow dot.

It is a best guess, not a record. On main roads with a report every few minutes it is usually
right. Between reports far apart, and in dense streets, it picks the likeliest way. It can't tell
a flyover from the street under it without enough reports either side. In simulated drives around
Giza and Cairo (reports every 2 to 7 minutes, one in five pushed 60 to 150 m sideways), 84% of the
suggested route was on the road actually driven, against 15% of the straight lines. Gaps of more
than 30 minutes stay dashed: nothing says how that stretch went.

Turn it on in **Settings → Predicted routes**. There are two ways.

**Built in.** This server does it: it downloads [OpenStreetMap](https://www.openstreetmap.org)
map data from [Geofabrik](https://download.geofabrik.de) for the places your items go, prepares
it, and runs [Valhalla](https://github.com/valhalla/valhalla), the open-source routing engine,
inside the app's own container. Nothing else to install.

- With **Download map data automatically** on, a country (or a state, where Geofabrik splits the
  country) is fetched as soon as recent history reaches it. Anything over 1.5 GB waits for you.
  Add or remove regions yourself in the same place, and **Update maps** now and then: roads
  change.
- Preparing a region takes a minute or two and about 2 GB of memory while it runs; afterwards
  routing is light. Egypt, for example, is a 178 MB download that becomes 740 MB of road data.
  If the container has less memory, set `ROUTING_BUILD_THREADS=1`.
- Only the map download leaves your server. Your items' positions never do.

**Another Valhalla server.** Run Valhalla yourself, for example next to this app in
`compose.yaml`, and point the app at it with `ROUTING_URL` (or enter the address in Settings):

```yaml
services:
  valhalla:
    image: ghcr.io/valhalla/valhalla-scripted:3.9.0
    environment:
      # Space-separated: every region your items go to.
      tile_urls: https://download.geofabrik.de/africa/egypt-latest.osm.pbf
    volumes:
      - ./valhalla:/custom_files
    restart: unless-stopped

  find-my-tracker:
    environment:
      ROUTING_URL: http://valhalla:8002
```

One setting matters: Valhalla only connects reports up to 2 km apart unless told otherwise, and a
car's reports are often further apart than that. After the first start, set
`"breakage_distance": 100000` under `meili.default` in `valhalla/valhalla.json`, and restart the
container. (The built-in engine does this for you.) Map data for a server like this is managed
where it runs; Settings shows whether it is reachable.

**Items in vehicles.** For an item left in a car, open it in **Settings → Items** and turn on
**Lives in a vehicle**: its trips are matched to roads a car can use, however slowly it seemed to
move. Anything else is matched on foot, unless a trip moved like a vehicle (faster than 25 km/h).

## Putting it on the internet 🌐

The safest version of this app is one nothing outside your house can reach. If you only need it
from your own phone and laptop, a VPN back into your network — [Tailscale](https://tailscale.com),
[WireGuard](https://www.wireguard.com) — beats everything below: nothing is exposed, there is no
certificate to renew, and no login page for strangers to find.

If you would rather reach it from any browser, here is how to do it without leaving the front
door open.

### 1. Turn on two-factor authentication

Settings → Security → **Set up authenticator app**. Scan the QR code with Google Authenticator,
the iOS Passwords app, 1Password, Bitwarden or anything else that does TOTP, then enter a code to
confirm. Save the recovery codes somewhere that is not the phone holding the authenticator.

It is optional, and the dashboard works without it. It is also the single biggest difference
between "someone guessed my password" and "someone guessed my password and got nowhere", so turn
it on before you open the door. While it is off, one password is all that stands between the
internet and a map of where your family's things have been.

Also: use a long password, at least 12 characters, and not one you use anywhere else.

### 2. Serve it over HTTPS

Plain HTTP over the internet means your password, your session cookie and every coordinate travel
in the clear. Don't.

With [DuckDNS](https://www.duckdns.org) keeping a subdomain pointed at your home IP, in `.env`:

```bash
DOMAIN=yourname.duckdns.org
ACME_EMAIL=you@example.com
```

then:

```bash
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/compose.internet.yaml
curl -O https://raw.githubusercontent.com/najm101/find-my-tracker/main/Caddyfile
docker compose -f compose.yaml -f compose.internet.yaml up -d
```

Forward **ports 80 and 443** on your router to this machine, and nothing else. Caddy gets a
Let's Encrypt certificate on its own and renews it. The app itself stays bound to `127.0.0.1`.

Running your own proxy instead (nginx, Traefik, Dokploy's built-in one)? Set `FORCE_HTTPS=true`,
`TRUSTED_PROXIES` to your proxy's address, and `ALLOWED_HOSTS` to your domain. The first two
matter more than they look: without them the session cookie is never marked `Secure`, and every
visitor in the world shares a single login rate-limit bucket — so one attacker hammering the
login page locks *you* out.

### 3. Encrypt the disk underneath it

The database holds your beacon keys, your Apple session and your two-factor secret encrypted with
`SECRET_KEY`. Your **location history is not** encrypted column by column: doing that would make
the spatial index useless and turn map panning into a per-row decrypt. Encrypt the storage
instead — it covers the history, the write-ahead log, temporary files and logs in one go, and
costs nothing at query time.

**SQLite (the default).** Put `data/` on an encrypted volume, or use an encrypted filesystem on
the host. On Linux, LUKS:

```bash
cryptsetup luksFormat /dev/sdX1
cryptsetup open /dev/sdX1 tracker
mkfs.ext4 /dev/mapper/tracker
mount /dev/mapper/tracker /srv/tracker      # then keep data/ under here
```

**PostgreSQL.** Community PostgreSQL has no built-in transparent encryption, so there is no
SQLCipher equivalent to switch on. Encrypt the volume its data directory lives on — with Docker
that is the volume mounted at `/var/lib/postgresql/data` — using LUKS or ZFS native encryption.
[Percona's `pg_tde`](https://docs.percona.com/pg-tde/) is a real in-database option if you would
rather not touch the host, at the cost of running Percona's PostgreSQL image.

**Encrypt your backups too.** This is where data usually leaks, not the live server:

```bash
pg_dump "$DATABASE_URL" | age -r age1yourkey... > tracker-$(date +%F).sql.age
```

None of this protects a server someone has already broken into — the database must be able to
read its own data while it is running. It protects cold copies: a stolen disk, a leaked backup, a
drive you threw away.

### 4. Know what is still true

- **A DuckDNS name is guessable and will be scanned** within hours of going up. Expect login
  attempts from strangers. Settings → Security shows the recent ones, so you can see them.
- Failed logins are rate-limited to 5 per IP per 5 minutes, and every attempt is recorded.
- If you think a session cookie was copied, **Sign out everywhere** in Settings invalidates every
  cookie ever issued, without touching `SECRET_KEY`.
- The dashboard sends no analytics and loads nothing from a CDN. Map tiles come from
  OpenFreeMap and Esri, which see your server's requests but not your URLs
  (`Referrer-Policy: no-referrer`).
- Everything the server answers with is `Cache-Control: no-store`, and a strict
  Content-Security-Policy means an injected script cannot run.

## Try it without an Apple account

Set `DEMO_MODE=true` and the server talks to a fake Apple instead of the real one. In the wizard,
use any Apple ID and password, the code `123456`, and the passcode `1234`. You get five items
following two weeks of made-up routines around Amsterdam. Real Apple servers are never contacted.

```bash
docker run --rm -p 8080:8080 -e DEMO_MODE=true \
  -e SECRET_KEY="$(openssl rand -base64 48)" -e ADMIN_PASSWORD=demodemo \
  ghcr.io/najm101/find-my-tracker:latest
```

## Contributing

Running it from source, the layout, the checks CI runs and how releases work are all in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Issues and pull requests are welcome.

## Credits 🙏

- [**OpenTagViewer**](https://github.com/parawanderer/OpenTagViewer) by parawanderer: the
  Android app that inspired this project, and the source of much of what I know about how this
  works
- [**FindMy.py**](https://github.com/malmeloo/FindMy.py) by malmeloo and contributors: does all
  the actual talking to Apple. This project currently uses
  [parawanderer's fork](https://github.com/parawanderer/FindMy.py) for iCloud Keychain export
- [**OpenHaystack**](https://github.com/seemoo-lab/openhaystack) by SEEMOO Lab: the research
  that made all of this possible, and [anisette-v3-server](https://github.com/Dadoum/anisette-v3-server)
  by Dadoum for the optional external anisette provider
- [shadcn/ui](https://ui.shadcn.com), [mapcn](https://mapcn.dev) and
  [MapLibre GL JS](https://maplibre.org) for the dashboard. Map data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, served by
  [OpenFreeMap](https://openfreemap.org); satellite imagery by Esri
- Built with a lot of help from [Claude](https://claude.ai) (Anthropic) as a coding assistant

## License

[MIT](./LICENSE), same as OpenTagViewer and FindMy.py. Do what you like with it, but read the
[disclaimer](#%EF%B8%8F-disclaimer) first.
