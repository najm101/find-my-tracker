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
  ]),
] satisfies RouteConfig
