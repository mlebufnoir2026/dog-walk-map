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

const COLORS = {
  bg: 'rgba(255,255,255,0.88)',
  bgStrong: 'rgba(255,255,255,0.94)',
  border: 'rgba(15, 23, 42, 0.07)',
  text: '#111111',
  textSoft: '#6b7280',
  textMuted: '#8b8b8b',
  accent: '#fc4c02',
  accentDark: '#e64600',
  accentSoft: '#fff1eb',
  neutralButton: '#f3f4f6',
  neutralButtonText: '#1f2937',
  dangerSoft: '#fef2f2',
  dangerText: '#991b1b',
  line: '#fc4c02',
}

const FONT_FAMILY = "'Sometype Mono', monospace"

const userIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width: 18px;
      height: 18px;
      background: #111111;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 8px rgba(17, 17, 17, 0.10);
    "></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
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
  const [showHistory, setShowHistory] = useState(false)

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

    if (watchIdRef.current !== null) return

    setError('')
    setSelectedWalkId(null)
    setShowHistory(false)

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

          if (accuracy > 50) return prev

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

          if (addedDistance < 5) return prev
          if (addedDistance > 100) return prev

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
    setSelectedWalkId(null)
  }

  const openWalk = (walk) => {
    setSelectedWalkId(walk.id)
    setPath(walk.points || [])
    if (walk.points?.length) {
      setPosition(walk.points[walk.points.length - 1])
    }
    setShowHistory(false)
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

  const mainDistanceKm = ((currentWalk?.distanceMeters || 0) / 1000).toFixed(2)
  const selectedDistanceKm = ((selectedWalk?.distanceMeters || 0) / 1000).toFixed(2)

  const glassCard = {
    background: COLORS.bg,
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border: `1px solid ${COLORS.border}`,
    boxShadow: '0 10px 30px rgba(17, 17, 17, 0.08)',
    borderRadius: '24px',
    fontFamily: FONT_FAMILY,
  }

  const smallButton = {
    border: 'none',
    borderRadius: '14px',
    padding: '11px 14px',
    fontSize: '13px',
    fontWeight: 600,
    background: COLORS.neutralButton,
    color: COLORS.neutralButtonText,
    cursor: 'pointer',
    fontFamily: FONT_FAMILY,
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          gap: '12px',
        }}
      >
        <div
          style={{
            ...glassCard,
            pointerEvents: 'auto',
            padding: '12px 16px',
            maxWidth: '240px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: COLORS.textSoft,
              marginBottom: '6px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Dog Walk Map
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: COLORS.text,
              lineHeight: 1.15,
            }}
          >
            {isTracking
              ? 'Balade en cours'
              : selectedWalk
              ? 'Balade enregistrée'
              : 'Prêt à partir'}
          </div>
        </div>

        <button
          onClick={() => setShowHistory((prev) => !prev)}
          style={{
            ...glassCard,
            pointerEvents: 'auto',
            border: 'none',
            padding: '14px 18px',
            fontSize: '14px',
            fontWeight: 700,
            color: COLORS.text,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showHistory ? 'Fermer' : `Historique (${savedWalks.length})`}
        </button>
      </div>

      {showHistory && (
        <div
          style={{
            position: 'absolute',
            top: 78,
            left: 14,
            right: 14,
            zIndex: 1000,
            maxHeight: '45vh',
            overflowY: 'auto',
            ...glassCard,
            padding: '16px',
          }}
        >
          <div
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: COLORS.text,
              marginBottom: '14px',
            }}
          >
            Historique
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <div
              style={{
                background: COLORS.bgStrong,
                borderRadius: '16px',
                padding: '12px',
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: '11px', color: COLORS.textSoft, marginBottom: '6px' }}>
                Balades
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: COLORS.text }}>
                {savedWalks.length}
              </div>
            </div>

            <div
              style={{
                background: COLORS.bgStrong,
                borderRadius: '16px',
                padding: '12px',
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: '11px', color: COLORS.textSoft, marginBottom: '6px' }}>
                Distance totale
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: COLORS.text }}>
                {(totalDistanceMeters / 1000).toFixed(2)} km
              </div>
            </div>

            <div
              style={{
                background: COLORS.bgStrong,
                borderRadius: '16px',
                padding: '12px',
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: '11px', color: COLORS.textSoft, marginBottom: '6px' }}>
                Temps total
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: COLORS.text }}>
                {formatDuration(totalDurationSec)}
              </div>
            </div>
          </div>

          {savedWalks.length === 0 ? (
            <div style={{ color: COLORS.textSoft, fontSize: '13px' }}>
              Aucune balade enregistrée pour le moment.
            </div>
          ) : (
            savedWalks.map((walk) => (
              <div
                key={walk.id}
                style={{
                  background: 'rgba(255,255,255,0.72)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '18px',
                  padding: '14px',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: COLORS.text, fontSize: '13px' }}>
                    {formatDate(walk.startedAt)}
                  </div>
                  {selectedWalkId === walk.id && !isTracking && (
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: COLORS.accentDark,
                        background: COLORS.accentSoft,
                        padding: '6px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      affichée
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: COLORS.textSoft, marginBottom: '10px' }}>
                  {formatDuration(walk.durationSec)} — {(walk.distanceMeters / 1000).toFixed(2)} km
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => openWalk(walk)}
                    style={{
                      ...smallButton,
                      background: COLORS.accentSoft,
                      color: COLORS.accentDark,
                    }}
                  >
                    Voir le tracé
                  </button>
                  <button
                    onClick={() => deleteWalk(walk.id)}
                    style={{
                      ...smallButton,
                      background: COLORS.dangerSoft,
                      color: COLORS.dangerText,
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            bottom: 178,
            zIndex: 1000,
            ...glassCard,
            padding: '14px 16px',
            color: COLORS.dangerText,
            background: 'rgba(254,242,242,0.95)',
            border: '1px solid rgba(252,165,165,0.55)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            ...glassCard,
            pointerEvents: 'auto',
            padding: '18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              alignItems: 'flex-start',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: COLORS.textSoft, marginBottom: '6px' }}>
                {isTracking
                  ? 'Session active'
                  : selectedWalk
                  ? 'Dernière balade affichée'
                  : 'Nouvelle sortie'}
              </div>

              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: COLORS.text,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {isTracking
                  ? formatDuration(currentWalk?.durationSec || 0)
                  : selectedWalk
                  ? formatDuration(selectedWalk.durationSec || 0)
                  : '0m 0s'}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: COLORS.textSoft, marginBottom: '6px' }}>
                Distance
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: COLORS.text,
                  lineHeight: 1,
                  letterSpacing: '-0.04em',
                }}
              >
                {isTracking ? mainDistanceKm : selectedWalk ? selectedDistanceKm : '0.00'} km
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: !isTracking ? '10px' : 0 }}>
            {!isTracking ? (
              <button
                onClick={startTracking}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '18px',
                  padding: '18px',
                  fontSize: '17px',
                  fontWeight: 700,
                  background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentDark} 100%)`,
                  color: 'white',
                  boxShadow: '0 10px 24px rgba(252, 76, 2, 0.22)',
                  cursor: 'pointer',
                  fontFamily: FONT_FAMILY,
                }}
              >
                Démarrer la balade
              </button>
            ) : (
              <button
                onClick={stopTracking}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: '18px',
                  padding: '18px',
                  fontSize: '17px',
                  fontWeight: 700,
                  background: '#111111',
                  color: 'white',
                  boxShadow: '0 10px 24px rgba(17, 17, 17, 0.18)',
                  cursor: 'pointer',
                  fontFamily: FONT_FAMILY,
                }}
              >
                Arrêter
              </button>
            )}
          </div>

          {!isTracking && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={resetTrack}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: '14px',
                  padding: '13px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: COLORS.neutralButton,
                  color: COLORS.neutralButtonText,
                  cursor: 'pointer',
                  fontFamily: FONT_FAMILY,
                }}
              >
                Réinitialiser
              </button>

              <button
                onClick={() => setShowHistory((prev) => !prev)}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: '14px',
                  padding: '13px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: COLORS.accentSoft,
                  color: COLORS.accentDark,
                  cursor: 'pointer',
                  fontFamily: FONT_FAMILY,
                }}
              >
                {showHistory ? 'Masquer l’historique' : 'Voir l’historique'}
              </button>
            </div>
          )}
        </div>
      </div>

      <MapContainer
        center={[48.8566, 2.3522]}
        zoom={14}
        style={{ height: '100vh', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {position && <RecenterMap position={position} isTracking={isTracking} />}

        {position && <Marker position={position} icon={userIcon} />}

        {displayedPath.length > 1 && (
          <Polyline
            positions={displayedPath}
            pathOptions={{
              color: COLORS.line,
              weight: 6,
              opacity: 0.96,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

export default App