import { useEffect, useState, useCallback } from 'react'

const slides: React.ReactNode[] = [
  <img src="/pow/Gandalf_1.jpg" alt="" style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }} />,
  <><div className="word accent">Papier.</div><div className="word">Verloren.</div></>,
  <div className="word accent">Nie wieder.</div>,
  <><div className="word">Smartphone.</div><div className="word accent">Tag. Fertig.</div></>,
  <><div className="word">QR. NFC. Link.</div><div className="word dim">Drei Wege. Ein Ziel.</div></>,
  <><div className="word">Ohne Login.</div><div className="word accent">Sofort sichtbar.</div></>,
  <><div className="word">Tierarzt scannt.</div><div className="word accent">Alles da.</div></>,
  <><div className="word">KI liest.</div><div className="word">KI versteht.</div><div className="word accent">KI speichert.</div></>,
  <div className="word accent">Sprechen genügt.</div>,
  <div className="word accent">Automatisch übersetzt.</div>,
  <><div className="word">Strukturiert.</div><div className="word">Sofort.</div><div className="word accent">Überall.</div></>,
  <><div className="word">Ein Scan.</div><div className="word accent">Alles drin.</div></>,
  <><div className="word">Kein Aufwand.</div><div className="word accent">Null Fehler.</div></>,
  <><div className="word accent">Vetzsucht.</div><div className="word dim">eCard for pets.</div></>,
  <><div className="word">Gibt's das</div><div className="word accent">schon?</div></>,
  <div className="word accent">NEIN.</div>,
  <><div className="word">Was gibt</div><div className="word dim">es stattdessen?</div></>,
  <><div className="word accent">Papierheft.</div><div className="word dim">Verlierbar. Unleserlich. 1980.</div></>,
  <><div className="word accent">Tierarzt-Software.</div><div className="word dim">Geschlossen. Kein Zugriff für Besitzer.</div></>,
  <><div className="word accent">Foto-App.</div><div className="word dim">Kein NFC. Kein KI. Keine Struktur.</div></>,
  <div className="word">Und wir?</div>,
  <><div className="word">NFC-Scan.</div><div className="word accent">Sofort. Ohne Login.</div></>,
  <><div className="word">Dokument hochladen.</div><div className="word accent">KI liest. KI strukturiert.</div></>,
  <><div className="word">Sprachnotiz.</div><div className="word accent">Tierarzt spricht. Vetzsucht speichert.</div></>,
  <><div className="word">Gast. Tierarzt.</div><div className="word">Behörde. Besitzer.</div><div className="word accent">Jeder sieht genau genug.</div></>,
  <><div className="word accent">Vetzsucht.</div><div className="word dim">Das ist unser USP.</div></>,
  <img src="/pow/Gandalf_2.jpg" alt="" style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }} />,
  <img src="/pow/Frodo_gandalf_usp.jpg" alt="" style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }} />,
  <img src="/pow/Frodo_demo.jpg" alt="" style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }} />,
]

export default function PresentationPage() {
  const [current, setCurrent] = useState(0)
  const [key, setKey] = useState(0)

  const go = useCallback((n: number) => {
    setCurrent((_c) => {
      const next = (n + slides.length) % slides.length
      setKey((k) => k + 1)
      return next
    })
  }, [])

  const next = useCallback(() => go(current + 1), [current, go])
  const prev = useCallback(() => go(current - 1), [current, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') next()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  useEffect(() => {
    let tx = 0
    const onStart = (e: TouchEvent) => { tx = e.touches[0].clientX }
    const onEnd = (e: TouchEvent) => {
      const dx = tx - e.changedTouches[0].clientX
      if (Math.abs(dx) > 40) dx > 0 ? next() : prev()
    }
    window.addEventListener('touchstart', onStart)
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [next, prev])

  const onClick = (e: React.MouseEvent) => {
    if (e.clientX > window.innerWidth / 2) next(); else prev()
  }

  return (
    <>
      <style>{`
        .pres-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
        .pres-wrap {
          position: fixed; inset: 0; z-index: 9999;
          background: #000; color: #fff;
          font-family: 'Arial Black', 'Helvetica Neue', sans-serif;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 0.2em; text-align: center;
          padding: 60px; user-select: none; cursor: pointer;
          animation: presIn 0.25s ease;
        }
        @keyframes presIn { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
        .pres-wrap .word {
          font-size: clamp(48px, 10vw, 120px); font-weight: 900;
          line-height: 1.05; letter-spacing: -0.02em; text-transform: uppercase;
        }
        .pres-wrap .word.accent { color: #e8ff00; }
        .pres-wrap .word.dim { color: #888; font-size: clamp(32px, 6vw, 72px); font-weight: 700; }
        .pres-dots {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 8px; z-index: 10000;
        }
        .pres-dots span {
          width: 6px; height: 6px; border-radius: 50%; background: #333; transition: background 0.2s;
        }
        .pres-dots span.on { background: #fff; }
      `}</style>
      <div key={key} className="pres-wrap" onClick={onClick}>
        {slides[current]}
      </div>
      <div className="pres-dots">
        {slides.map((_, i) => (
          <span key={i} className={i === current ? 'on' : ''} />
        ))}
      </div>
    </>
  )
}
