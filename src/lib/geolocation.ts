export interface LocationData {
  city?:   string
  region?: string
  country?: string
  lat?:    number
  lng?:    number
  source:  'gps' | 'ip'
}

export async function getUserLocation(): Promise<LocationData> {
  let lat: number | undefined
  let lng: number | undefined

  // Try GPS first (3s timeout, low accuracy = faster)
  if ('geolocation' in navigator) {
    const pos = await new Promise<GeolocationPosition | null>(resolve =>
      navigator.geolocation.getCurrentPosition(
        p  => resolve(p),
        () => resolve(null),
        { timeout: 3000, enableHighAccuracy: false }
      )
    )
    if (pos) {
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    }
  }

  // Always fetch city/country from IP (even when GPS succeeded)
  try {
    const res  = await fetch('https://ipapi.co/json/')
    const data = await res.json()
    return {
      city:    data.city,
      region:  data.region,
      country: data.country_name,
      lat:     lat ?? data.latitude,
      lng:     lng ?? data.longitude,
      source:  lat != null ? 'gps' : 'ip',
    }
  } catch {
    return { lat, lng, source: lat != null ? 'gps' : 'ip' }
  }
}
