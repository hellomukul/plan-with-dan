/**
 * A Labubu built only from HTML + CSS (no images): tall bunny ears, big eyes,
 * a toothy grin and a fuzzy body. Colour, size, mood and a little accessory are props.
 */
import type { CSSProperties } from 'react'
import './labubu.css'

type Mood = 'grin' | 'wow' | 'sleepy' | 'wink'
type Prop = 'none' | 'book' | 'heart' | 'flag' | 'cap' | 'coffee'

interface Props {
  fur?: string
  face?: string
  size?: number
  mood?: Mood
  holding?: Prop
  className?: string
  title?: string
  dance?: boolean
}

const HOLD: Record<Prop, string> = { none: '', book: '📘', heart: '💖', flag: '🌍', cap: '🎓', coffee: '🧋' }

export default function Labubu({
  fur = '#ff8cc6', face = '#fde6dc', size = 120, mood = 'grin', holding = 'none', className = '', title, dance = false,
}: Props) {
  const style = { '--fur': fur, '--face': face, '--s': `${size}px` } as CSSProperties
  return (
    <div className={`lbb ${dance ? 'lbb-dance' : ''} ${className}`} style={style} role="img" aria-label={title ?? 'Labubu'}>
      <div className="lbb-ear left"><span /></div>
      <div className="lbb-ear right"><span /></div>
      <div className="lbb-head">
        <div className="lbb-face">
          <div className={`lbb-eye left ${mood}`} />
          <div className={`lbb-eye right ${mood === 'wink' ? 'wink' : mood}`} />
          <div className="lbb-blush left" />
          <div className="lbb-blush right" />
          <div className={`lbb-mouth ${mood}`}>
            {mood !== 'wow' && Array.from({ length: 9 }, (_, i) => <i key={i} />)}
          </div>
        </div>
      </div>
      <div className="lbb-body">
        <div className="lbb-arm left" />
        <div className="lbb-arm right" />
        {holding !== 'none' && <div className="lbb-hold">{HOLD[holding]}</div>}
      </div>
      <div className="lbb-feet"><span /><span /></div>
    </div>
  )
}
