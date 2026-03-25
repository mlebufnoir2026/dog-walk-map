import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const STORAGE_KEY = 'dogwalk_saved_walks'
const DRAFT_KEY = 'dogwalk_current_walk'

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

function formatDuration(seconds) {
  const safe = Math.max(0, seconds || 0)
  const hrs = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
  return `${mins}m ${secs}s`
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSavedWalks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveWalk(walk) {
  const walks = getSavedWalks()
  walks.unshift(walk)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(walks))
}

function saveDraftWalk(walk) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(walk))
}

function getDraftWalk() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
  } catch {
    return null
  }
}

function clearDraftWalk() {
  localStorage.removeItem(DRAFT_KEY)
}

function deleteWalkById(id) {
  const walks = getSavedWalks().filter((walk) => walk.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(walks))
  return walks
}

function App() {
  const [position, setPosition] = useState(null)
  const [path, setPath] = useState([])
  const [isTracking, setIsTracking] = useState(false)
  const [error, setError] = useState('')
  const [savedWalks, setSavedWalks] = useState([])
  const [currentWalk, setCurrentWalk] = useState(null)
  const [selectedWalkId, setSelectedWalkId] = useState(null)

  const watchIdRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const walks = getSavedWalks()
    setSavedWalks(walks)

    const draft = getDraftWalk()
    if (draft) {
      setCurrentWalk(draft)
      setPath(draft.points || [])
      if (draft.points?.length) {
        setPosition(draft.points[draft.points.length - 1])
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const selectedWalk =
    savedWalks.find((walk) => walk.id === selectedWalkId) || null

  const displayedPath =
    isTracking && currentWalk?.points?.length
      ? currentWalk.points
      : selectedWalk?.points || path

  const totalDistanceMeters = useMemo(() => {
    return savedWalks.reduce((sum, walk) => sum + (walk.distanceMeters || 0), 0)
  }, [savedWalks])

  const totalDurationSec = useMemo(() => {
    return savedWalks.reduce((sum, walk) => sum + (walk.durationSec || 0), 0)
  }, [savedWalks])

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas supportée par ce navigateur.')
      return
    }

    if (watchIdRef.current !== null) {
      return
    }

    setError('')
    setSelectedWalkId(null)

    const startedAt = new Date().toISOString()

    const newWalk = {
      id: crypto.randomUUID(),
      startedAt,
      endedAt: null,
      durationSec: 0,
      distanceMeters: 0,
      points: [],
    }

    setCurrentWalk(newWalk)
    setPath([])
    setIsTracking(true)

    timerRef.current = window.setInterval(() => {
      setCurrentWalk((prev) => {
        if (!prev) return prev

        const durationSec = Math.floor(
          (Date.now() - new Date(prev.startedAt).getTime()) / 1000
        )

        const updatedWalk = {
          ...prev,
          durationSec,
        }

        saveDraftWalk(updatedWalk)
        return updatedWalk
      })
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const newPoint = [latitude, longitude]

        setPosition(newPoint)

        setCurrentWalk((prev) => {
          if (!prev) return prev

          if (accuracy > 50) {
            return prev
          }

          const previousPoint = prev.points[prev.points.length - 1]

          if (!previousPoint) {
            const updatedWalk = {
              ...prev,
              points: [newPoint],
            }
            setPath([newPoint])
            saveDraftWalk(updatedWalk)
            return updatedWalk
          }

          const addedDistance = distanceInMeters(previousPoint, newPoint)

          if (addedDistance < 5) {
            return prev
          }

          if (addedDistance > 100) {
            return prev
          }

          const updatedPoints = [...prev.points, newPoint]
          const updatedWalk = {
            ...prev,
            points: updatedPoints,
            distanceMeters: prev.distanceMeters + addedDistance,
          }

          setPath(updatedPoints)
          saveDraftWalk(updatedWalk)
          return updatedWalk
        })
      },
      (err) => {
        console.error(err)
        setError("Impossible d'obtenir ta position.")
        setIsTracking(false)

        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }

        if (timerRef.current !== null) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
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

    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setIsTracking(false)

    setCurrentWalk((prev) => {
      if (!prev) return null

      const finishedWalk = {
        ...prev,
        endedAt: new Date().toISOString(),
      }

      if (finishedWalk.points.length > 0) {
        saveWalk(finishedWalk)
        const updatedWalks = getSavedWalks()
        setSavedWalks(updatedWalks)
        setSelectedWalkId(finishedWalk.id)
      }

      clearDraftWalk()
      return null
    })
  }

  const resetTrack = () => {
    if (isTracking) return
    setPath([])
    setPosition(null)
    setError('')
    setCurrentWalk(null)
    clearDraftWalk()
  }

  const openWalk = (walk) => {
    setSelectedWalkId(walk.id)
    setPath(walk.points || [])
    if (walk.points?.length) {
      setPosition(walk.points[walk.points.length - 1])
    }
  }

  const deleteWalk = (id) => {
    if (isTracking) return
    const updatedWalks = deleteWalkById(id)
    setSavedWalks(updatedWalks)

    if (selectedWalkId === id) {
      setSelectedWalkId(null)
      setPath([])
    }
  }

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1000,
          width: 'min(360px, calc(100% - 24px))',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.96)',
            padding: '12px',
            borderRadius: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>
            Balade en cours
          </div>

          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>Durée :</strong>{' '}
            {currentWalk ? formatDuration(currentWalk.durationSec) : '0m 0s'}
          </div>

          <div style={{ fontSize: '14px', marginBottom: '10px' }}>
            <strong>Distance :</strong>{' '}
            {currentWalk
              ? (currentWalk.distanceMeters / 1000).toFixed(2)
              : '0.00'}{' '}
            km
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={startTracking} disabled={isTracking}>
              Démarrer
            </button>
            <button onClick={stopTracking} disabled={!isTracking}>
              Stop
            </button>
            <button onClick={resetTrack} disabled={isTracking}>
              Réinitialiser
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(255,255,255,0.96)',
              padding: '10px 12px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            background: 'rgba(255,255,255,0.96)',
            padding: '12px',
            borderRadius: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>Stats</div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>Nombre de balades :</strong> {savedWalks.length}
          </div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>Distance totale :</strong>{' '}
            {(totalDistanceMeters / 1000).toFixed(2)} km
          </div>
          <div style={{ fontSize: '14px' }}>
            <strong>Temps total :</strong> {formatDuration(totalDurationSec)}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.96)',
            padding: '12px',
            borderRadius: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>Historique</div>

          {savedWalks.length === 0 ? (
            <div style={{ fontSize: '14px' }}>
              Aucune balade enregistrée pour le moment.
            </div>
          ) : (
            savedWalks.map((walk) => (
              <div
                key={walk.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  padding: '10px 0',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600 }}>
                  {formatDate(walk.startedAt)}
                </div>
                <div style={{ fontSize: '13px', margin: '4px 0 8px' }}>
                  {formatDuration(walk.durationSec)} —{' '}
                  {(walk.distanceMeters / 1000).toFixed(2)} km
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => openWalk(walk)}>Voir</button>
                  <button onClick={() => deleteWalk(walk.id)}>Supprimer</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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

        {displayedPath.length > 1 && (
          <Polyline
            positions={displayedPath}
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