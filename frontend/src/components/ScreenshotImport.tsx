/* Import courses you've taken from a screenshot (student feedback: "take a screenshot from Yale Hub and paste it, so
   the tool picks up my courses so far"). The browser shrinks the image to a small JPEG, Dan reads the course
   numbers (and any clearly shown grades), and the student ticks what to keep. Each course shows its real catalog
   title, so a misread number is easy to spot. Nothing is saved until they confirm, and the image isn't kept. */
import { useRef, useState } from 'react'
import { Check, ImageUp, X } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { CostChip } from './ui'

interface Found { number: string; title: string; grade: string; known: boolean; already: boolean }
const GRADE_NAMES: Record<string, string> = { HH: 'High Honors', H: 'Honors', PR: 'Proficient', P: 'Pass', F: 'Fail' }

/** Downscale to at most 1600px wide and re-encode as JPEG, staying well under the server's 1 MB request cap. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    let w = Math.min(1600, img.naturalWidth)
    for (let q = 0.85; ; q -= 0.15) {
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = Math.round((img.naturalHeight * w) / img.naturalWidth)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', Math.max(0.5, q))
      if (data.length < 900_000 || w < 700) return data
      if (q <= 0.55) { w = Math.round(w * 0.8); q = 1 }
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function ScreenshotImport({ onAdded }: { onAdded: (numbers: string[]) => void }) {
  const { toast } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null)
  const [found, setFound] = useState<Found[] | null>(null)
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [usage, setUsage] = useState<Parameters<typeof CostChip>[0]['usage']>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Use a PNG, JPEG or WebP screenshot.', 'bad'); return }
    setBusy('reading'); setFound(null); setNote('')
    try {
      const r = await api.readCourses(await shrink(file))
      setFound(r.courses); setNote(r.note); setUsage(r.usage)
      setKeep(Object.fromEntries(r.courses.map((c) => [c.number, c.known && !c.already])))
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ''
    }
  }
  const chosen = (found ?? []).filter((c) => keep[c.number] && !c.already)
  const confirm = async () => {
    if (!chosen.length) return
    setBusy('saving')
    try {
      const r = await api.importCourses(chosen.map((c) => ({ number: c.number, grade: c.grade })))
      onAdded(r.added)
      toast(`Added ${r.added.length} course${r.added.length === 1 ? '' : 's'} you’ve taken`, 'good')
      setFound(null)
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="si">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy !== null} aria-busy={busy === 'reading'}>
        <ImageUp className="icon sm" aria-hidden="true" />{busy === 'reading' ? 'Reading your screenshot…' : 'Import from a screenshot'}
      </button>
      <span className="faint small">A screenshot of your course history in Yale Hub. Dan reads the course numbers; you confirm. The image isn’t kept.</span>
      {note && <p className="small amber-text" style={{ margin: 0 }}>{note}</p>}
      {found && found.length > 0 && (
        <div className="card flat si-list" role="group" aria-label="Courses found in your screenshot">
          <div className="row between">
            <b className="small">Found {found.length} course{found.length === 1 ? '' : 's'}. Untick anything that’s wrong.</b>
            <span className="row" style={{ gap: 8 }}><CostChip usage={usage} /><button type="button" className="btn icon ghost" aria-label="Close" onClick={() => setFound(null)}><X className="icon sm" /></button></span>
          </div>
          <ul>
            {found.map((c) => (
              <li key={c.number}>
                <label className={c.already ? 'is-done' : ''}>
                  <input type="checkbox" disabled={c.already} checked={c.already || !!keep[c.number]} onChange={(e) => setKeep((k) => ({ ...k, [c.number]: e.target.checked }))} />
                  <span className="mono">{c.number}</span>
                  <span className="si-title">{c.title || <span className="faint">Title not shown</span>}</span>
                  {c.grade && <span className="badge gray">{GRADE_NAMES[c.grade] ?? c.grade}</span>}
                  {c.already ? <span className="badge green"><Check className="icon sm" />Already listed</span>
                    : !c.known && <span className="faint small">Not in this year’s catalog: keep it only if you took it in an earlier year</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="btn primary sm" onClick={() => void confirm()} disabled={!chosen.length || busy !== null} aria-busy={busy === 'saving'}>
              {busy === 'saving' ? 'Adding…' : `Add ${chosen.length} course${chosen.length === 1 ? '' : 's'}`}
            </button>
            <span className="faint small">Grades shown are added to your Pass/Fail budget on Requirements.</span>
          </div>
        </div>
      )}
    </div>
  )
}
