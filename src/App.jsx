import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
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
      box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.20);
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function RecenterMap({ position, isTracking }) {
  const map = useMap()

  useEffect(() => {
    if (position && isTracking) {
      map.setView(position)
    }
  }, [position, isTracking, map])

  return null
}

function distanceInMeters(a, b) {
  const R = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function App() {
  const [position, setPosition] = useState(null)
  const [path, setPath] = useState([])
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState('')
  const watchIdRef = useRef(null)

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas supportée par ce navigateur.')
      return
    }

    if (watchIdRef.current !== null) {
      return
    }

    setError('')
    setIsTracking(true)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const newPoint = [latitude, longitude]

        setPosition(newPoint)

        setPath((prev) => {
          if (prev.length === 0) return [newPoint]

          const lastPoint = prev[prev.length - 1]
          const distance = distanceInMeters(lastPoint, newPoint)

          if (distance < 5) return prev

          return [...prev, newPoint]
        })
      },
      (err) => {
        console.error(err)
        setError("Impossible d'obtenir ta position.")
        setIsTracking(false)
        watchIdRef.current = null
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    )
  }

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
  }

  const resetTrack = () => {
    setPath([])
    setError('')
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1000,
          display: 'flex',
          gap: '8px',
          background: 'rgba(255,255,255,0.95)',
          padding: '10px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <button onClick={startTracking} disabled={isTracking}>
          Démarrer
        </button>
        <button onClick={stopTracking} disabled={!isTracking}>
          Stop
        </button>
        <button onClick={resetTrack}>Réinitialiser</button>
      </div>

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            left: 12,
            zIndex: 1000,
            background: 'rgba(255,255,255,0.95)',
            padding: '10px 12px',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxWidth: '280px',
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

        {position && <RecenterMap position={position} isTracking={isTracking} />}

        {position && <Marker position={position} icon={userIcon} />}

        {path.length > 1 && (
          <Polyline
            positions={path}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              opacity: 0.85,
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App