import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes"

export default [
  route("login", "routes/login.tsx"),
  layout("routes/authed-layout.tsx", [
    index("routes/home.tsx"),
    route("beacons/:beaconId", "routes/beacon.tsx"),
    route("places", "routes/places.tsx"),
    route("setup", "routes/setup.tsx"),
    route("settings", "routes/settings/layout.tsx", [
      index("routes/settings/index.tsx"),
      route("tracking", "routes/settings/tracking.tsx"),
      route("items", "routes/settings/items.tsx"),
      route("predicted-routes", "routes/settings/predicted-routes.tsx"),
      route("account", "routes/settings/account.tsx"),
      route("security", "routes/settings/security.tsx"),
      route("appearance", "routes/settings/appearance.tsx"),
      route("api", "routes/settings/api.tsx"),
    ]),
    route("status", "routes/status.tsx"),
  ]),
] satisfies RouteConfig
