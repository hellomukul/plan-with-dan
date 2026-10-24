/**
 * A monogram for this site, not Yale's official mark — that is a trademarked
 * asset we should not reproduce. This is a plain Y in the school's blue with
 * the school named beside it in text, which identifies the subject without
 * pretending to be an official Yale product.
 */
export function Wordmark() {
  return (
    <a className="wordmark" href="https://som.yale.edu" target="_blank" rel="noreferrer">
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <rect width="40" height="40" rx="7" fill="#fff" fillOpacity="0.12" />
        <rect
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          rx="6.25"
          fill="none"
          stroke="#c9a13b"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path
          d="M10 11 L20 22 L30 11"
          fill="none"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 22 L20 30"
          fill="none"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
      <span>
        <b>Yale</b>
        School of Management
      </span>
    </a>
  )
}
