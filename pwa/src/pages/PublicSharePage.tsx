import React from 'react'
import { useParams } from 'react-router-dom'

export default function PublicSharePage() {
  const { shareId } = useParams()
  return (
    <div className="page container">
      <h2>Temporäre Freigabe</h2>
      <p className="text-muted">Lade Daten für Freigabe-ID: {shareId}</p>
    </div>
  )
}