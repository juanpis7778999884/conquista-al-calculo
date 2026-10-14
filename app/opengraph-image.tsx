import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Conquista Cálculo | Carrera de cálculo por equipos'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #102526 0%, #1c3b39 100%)',
          color: '#f1e7cf',
          fontFamily: 'serif',
          padding: '80px',
        }}
      >
        <div style={{ fontSize: 78, fontWeight: 700, color: '#e0b75a', textAlign: 'center' }}>
          Conquista Cálculo
        </div>
        <div style={{ fontSize: 38, marginTop: 28, color: '#8fc3b6', textAlign: 'center' }}>
          Carrera de cálculo por equipos
        </div>
        <div
          style={{
            marginTop: 48,
            width: 240,
            height: 8,
            background: '#e87852',
            borderRadius: 8,
          }}
        />
      </div>
    ),
    size,
  )
}
