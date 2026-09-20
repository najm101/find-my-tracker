import { api, unwrap, type Schemas } from "~/lib/api/client"

export function listBeacons() {
  return unwrap(api.GET("/api/beacons"))
}

export function updateBeacon(id: number, patch: Schemas["BeaconUpdate"]) {
  return unwrap(
    api.PATCH("/api/beacons/{beacon_id}", {
      params: { path: { beacon_id: id } },
      body: patch,
    })
  )
}

export function deleteBeacon(id: number) {
  return unwrap(
    api.DELETE("/api/beacons/{beacon_id}", {
      params: { path: { beacon_id: id } },
    })
  )
}
