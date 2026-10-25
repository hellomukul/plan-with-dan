/** Elihu: Dan's course-picking owl, named after Elihu Yale. Built only from HTML and CSS (no image, no SVG):
 * ear tufts, a quill tucked behind one of them, a speckled belly, brass spectacles that catch the light, and a scroll he unrolls when you hover
 * whatever he sits in (any ancestor with class "elihu-host"). He blinks and tilts his head now and then;
 * all motion stops under prefers-reduced-motion. Decorative: always aria-hidden, so give his host a label. */
import type { CSSProperties } from 'react'
import './elihu.css'

interface ElihuProps {
  /** Width in px; height is 1.2x. */
  size?: number
  /** Hold still (e.g. in dense lists). */
  still?: boolean
  className?: string
}

export default function Elihu({ size = 64, still = false, className = '' }: ElihuProps) {
  return (
    <span className={`elihu ${still ? 'still' : ''} ${className}`} style={{ '--size': `${size}px` } as CSSProperties} aria-hidden="true">
      <span className="el-wing l" />
      <span className="el-body">
        <span className="el-belly"><span className="el-speckle" /></span>
      </span>
      <span className="el-head">
        <span className="el-quill" />
        <span className="el-tuft l" />
        <span className="el-tuft r" />
        <span className="el-crown" />
        <span className="el-disc l" />
        <span className="el-disc r" />
        <span className="el-eye l"><span className="el-pupil" /><span className="el-lid" /></span>
        <span className="el-eye r"><span className="el-pupil" /><span className="el-lid" /></span>
        <span className="el-specs">
          <span className="el-lens l"><span className="el-glint" /></span>
          <span className="el-bridge" />
          <span className="el-lens r"><span className="el-glint" /></span>
        </span>
        <span className="el-beak" />
      </span>
      <span className="el-feet"><span /><span /></span>
      <span className="el-scroll">
        <span className="el-paper"><span className="el-lines" /></span>
        <span className="el-roll t" />
        <span className="el-roll b" />
        <span className="el-seal" />
      </span>
      <span className="el-wing r" />
    </span>
  )
}
