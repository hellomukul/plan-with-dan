import { useState } from 'react'
import { PROGRAM_COLORS, REQUIREMENT_COLORS } from '../facets'
import type { FacetKey } from '../facets'
import HandsomeDan from './HandsomeDan'

interface Props {
  options: Record<FacetKey, [string, number][]>
}

/**
 * Every card carries two Labubus: a bigger one for the programme and a smaller
 * one for core-vs-elective. This explains the colours, collapsed by default.
 */
export function DanLegend({ options }: Props) {
  const [open, setOpen] = useState(false)

  const programs = (options.program ?? []).filter(([name]) => PROGRAM_COLORS[name])
  const requirements = (options.requirement ?? []).filter(
    ([name]) => REQUIREMENT_COLORS[name],
  )

  return (
    <div className="dankey">
      <button
        type="button"
        className="dankey__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dankey__dogs" aria-hidden="true">
          <HandsomeDan furColor={PROGRAM_COLORS.MBA} size={24} />
          <HandsomeDan furColor={REQUIREMENT_COLORS.Core} size={19} />
        </span>
        What the Labubus mean
        <span className="dankey__chev" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="dankey__panel">
          <section>
            <h4>Bigger Labubu — programme</h4>
            <p className="dankey__note">Who the course is for.</p>
            <ul>
              {programs.map(([name, n]) => (
                <li key={name}>
                  <HandsomeDan furColor={PROGRAM_COLORS[name]} size={28} />
                  <span>{name}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Smaller Labubu — requirement</h4>
            <p className="dankey__note">
              Whether it counts as core or as an elective.
            </p>
            <ul>
              {requirements.map(([name, n]) => (
                <li key={name}>
                  <HandsomeDan furColor={REQUIREMENT_COLORS[name]} size={28} />
                  <span>{name}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ul>
            <p className="dankey__foot">
              Subject area is the coloured chip on each card, not a Labubu — 18
              subjects is too many to tell apart by colour.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
