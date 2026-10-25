/* Smooth-scroll to an element, with a fallback: some browsers (reduced motion, background tabs,
   in-app browsers) skip smooth scrolling, so if nothing has moved shortly after, jump there. */
export function scrollToEl(el: Element | null, block: ScrollLogicalPosition = 'start'): void {
  if (!el) return
  const before = window.scrollY
  el.scrollIntoView({ behavior: 'smooth', block })
  setTimeout(() => {
    const r = el.getBoundingClientRect()
    const inView = r.top >= 0 && r.top < window.innerHeight * 0.6
    if (window.scrollY === before && !inView) el.scrollIntoView({ block })
  }, 350)
}
