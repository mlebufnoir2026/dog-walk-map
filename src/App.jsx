import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const userIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width: 16px;
      height: 16px;
      background: #2563eb;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.2);
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function RecenterMap({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position) {
      map.setView(position, 17)
    }
  }, [position, map])

  return null
}

function distanceInMeters(a, b) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])

  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)

  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return R * y
}

function App() {
  const [position, setPosition] = useState(null)
  const [path, setPath] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas supportée par ce navigateur.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const newPoint = [latitude, longitude]

        setPosition(newPoint)
        setError('')

        setPath((prev) => {
          if (prev.length === 0) return [newPoint]

          const lastPoint = prev[prev.length - 1]
          const distance = distanceInMeters(lastPoint, newPoint)

          if (distance < 5) return prev

          return [...prev, newPoint]
        })
      },
      (err) => {
        setError('Impossible d’obtenir ta position.')
        console.error(err)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {error && (
        <div
          style={{
            position: 'absolute',
            zIndex: 1000,
            top: 12,
            left: 12,
            background: 'white',
            padding: '10px 12px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            fontFamily: 'sans-serif',
          }}
        >
          {error}
        </div>
      )}

      <MapContainer
        center={[48.8566, 2.3522]}
        zoom={14}
        style={{ height: '100vh', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {position && (
          <>
            <RecenterMap position={position} />
            <Marker position={position} icon={userIcon}>
              <Popup>Tu es ici</Popup>
            </Marker>
          </>
        )}

        {path.length > 1 && (
          <Polyline
            positions={path}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              opacity: 0.8,
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App