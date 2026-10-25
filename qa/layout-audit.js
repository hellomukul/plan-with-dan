/* Layout audit for the home page: week builder, Course Explorer, hero, and the Get help guide on the Tools
   tab. Paste into the browser console (or run through the preview tool) at each width: 1440, 1024 and 375.
   It drives the page like a student and FAILS if the page length changes at any step, or if any control
   spills outside its card. Returns { pass, heights, spills, overflowingRows, hero, help }. */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const H = () => document.documentElement.scrollHeight
  const input = document.querySelector('.cx-search input')
  if (!input) return { pass: false, error: 'Course Explorer not on the page' }
  const type = async (v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(300)
  }
  const heights = new Set([H()])
  const tabs = () => [...document.querySelectorAll('.wb-tabs button')]
  for (const q of ['MGT 846', 'MGT 525', 'strategy', 'zz', '']) {
    await type(q); heights.add(H())
    document.querySelector('.cx-list li button')?.click(); await wait(250); heights.add(H())
    ;(document.querySelector('.cx-verdict .btn.primary') || document.querySelector('.cx-sections .btn'))?.click()
    await wait(400); heights.add(H())
  }
  for (const t of ['Fall', 'Spring']) { tabs().find((b) => b.textContent.includes(t))?.click(); await wait(1200); heights.add(H()) }
  const spills = []
  for (const card of document.querySelectorAll('.wb, .cx, .ws-bar')) {
    const cr = card.getBoundingClientRect()
    for (const el of card.querySelectorAll('button, select, input, .wb-tag, .cx-pill')) {
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1)) spills.push(`${el.className} outside ${card.className}`)
    }
  }
  const overflowingRows = [...document.querySelectorAll('.wb-picked li, .cx-list li > button')]
    .filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => el.textContent.slice(0, 40))
  document.querySelectorAll('.wb-picked li .btn[aria-label^="Remove"]').forEach((b) => b.click())
  await wait(400); heights.add(H())
  const sideways = document.documentElement.scrollWidth > window.innerWidth
  // Hero: on desktop Dan's card shares top and bottom edges with the left column; on phones they stack.
  const hc = document.querySelector('.hc')?.getBoundingClientRect()
  const meet = document.querySelector('.lp-meet')?.getBoundingClientRect()
  const trust = document.querySelector('.lp-trust')?.getBoundingClientRect()
  const copy = document.querySelector('.lp-hero-copy')?.getBoundingClientRect()
  const hero = !hc ? 'missing' : innerWidth > 900
    ? (Math.abs(hc.top - meet.top) <= 2 && Math.abs(hc.bottom - trust.bottom) <= 2 ? 'aligned' : `misaligned (top ${Math.round(hc.top - meet.top)}px, bottom ${Math.round(hc.bottom - trust.bottom)}px)`)
    : (hc.top >= copy.bottom - 1 ? 'stacked' : 'side-by-side on a phone')
  // Get help (Tools tab): picking any option must not change the page length; nothing spills; tap targets >= 44px.
  ;[...document.querySelectorAll('.ws-tabs button')].find((b) => b.textContent.trim() === 'Tools')?.click(); await wait(400)
  const help = { heights: new Set(), spills: [], smallTargets: [] }
  const pills = [...document.querySelectorAll('.ws-pane.on .hg-pill')]  // tabs stay mounted; use the visible one
  if (!pills.length) help.spills.push('Get help guide not on the Tools tab')
  else if (pills.length !== 4) help.spills.push(`expected 4 help doors, found ${pills.length}`)  // career, academics, wellbeing, international & more
  for (const p of pills) { p.click(); await wait(250); help.heights.add(H()) }
  pills[0]?.click(); await wait(200)
  for (const card of document.querySelectorAll('.hg-card')) {
    const cr = card.getBoundingClientRect()
    for (const el of card.querySelectorAll('button, a, .hg-tag')) {
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1)) help.spills.push(`${el.className || el.tagName} outside ${card.className}`)
    }
  }
  for (const el of document.querySelectorAll('.ws-pane.on .hg-pill, .ws-pane.on .hg-rec-inner.on .hg-go')) if (el.getBoundingClientRect().height < 44) help.smallTargets.push(el.textContent.trim())
  // Tools tab alignment (design tester, Oct 25): equal cards and tiles, a steady Book button, 44px targets, booking form.
  const toolsAlign = await (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const P = document.querySelector('.ws-pane.on'), q = (s) => P.querySelector(s), qa = (s) => [...P.querySelectorAll(s)]
    const R = (el) => el.getBoundingClientRect(), off = (a, b) => Math.abs(a - b) > 1
    const desk = innerWidth > 900, bad = []
  // the preview pane draws no frames in the background, so a mid-animation modal would measure small
    document.head.append(Object.assign(document.createElement('style'), { textContent: '*{animation:none!important;transition:none!important}' }))
    if (desk) {
      const pk = R(q('.hg-picker')), rec = R(q('.hg-rec'))
      if (off(pk.height, rec.height)) bad.push(`picker ${pk.height} vs recommendation ${rec.height}`)
      if (new Set(qa('.hg-pill').map((p) => Math.round(R(p).height))).size > 1) bad.push('help doors differ in height')
      const lastPill = Math.max(...qa('.hg-pill').map((p) => R(p).bottom))
      if (off(lastPill, R(q('.hg-rec-inner.on .hg-go')).bottom)) bad.push('last pill row and Book button bottoms differ')
      const tiles = qa('.hg-tile').map((t) => [R(t).height, R(t.querySelector('.hg-tile-label')).top, R(t.querySelector('.hg-tile-sub')).top])
      for (const i of [0, 1, 2]) if (new Set(tiles.map((t) => Math.round(t[i]))).size > 1) bad.push(`tiles differ in ${['height', 'label top', 'note top'][i]}`)
      const cards = qa('.ws-tools > .card').map(R)
      if (off(cards[0].bottom, cards[1].bottom)) bad.push('Links / glossary bottoms differ')
      if (off(cards[cards.length - 1].bottom, R(P).bottom)) bad.push('last Tools card does not reach the pane bottom')
    }
    const squeezed = qa('.hg-pill, .hg-rec-inner.on .hg-secondary a').filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 24))
    if (squeezed.length) bad.push(`text spills sideways in: ${squeezed.join(', ')}`)
    const goTops = new Set(qa('.hg-rec-inner .hg-go').map((g) => Math.round(R(g).top)))
    if (goTops.size > 1) bad.push(`Book button moves between options: ${[...goTops]}`)
    if (!q('.hg-dir.open') && off(R(q('.hg-privacy')).top - R(q('.hg-tiles')).bottom, 16)) bad.push('closed directory leaves a double gap')
    const small = qa('.hg-tel, .hg-rec-inner.on .hg-secondary a, .ws-links a, .ws-links .link-btn').filter((e) => R(e).height < 44).map((e) => e.textContent.trim().slice(0, 24))
  // directory open: no truncated notes, both columns end within 48px, page grows only by the directory
    q('.hg-tile-btn[aria-controls]').click(); await wait(400)
    const cut = qa('.hg-row-note').filter((e) => e.scrollWidth > e.clientWidth + 1).length
    if (cut) bad.push(`${cut} directory notes cut off`)
    const cols = qa('.hg-dir-col').map((c) => R(c).height).filter(Boolean)
    if (cols.length === 2 && Math.abs(cols[0] - cols[1]) > 48) bad.push(`directory columns end ${Math.round(Math.abs(cols[0] - cols[1]))}px apart`)
    small.push(...qa('.hg-group li a').filter((e) => R(e).height < 44).map((e) => e.textContent.trim().slice(0, 24)))
    q('.hg-tile-btn[aria-controls]').click(); await wait(400)
  // booking form: opening it never changes the page length; every control 44px; no inner scrolling
    const H = document.documentElement.scrollHeight
    qa('.hg-tile-btn')[0].click(); await wait(300)
    const f = document.querySelector('.hg-form')
    if (document.documentElement.scrollHeight !== H) bad.push('opening the booking form changed the page length')
    small.push(...[...f.querySelectorAll('input, button')].filter((e) => R(e).height < 44).map((e) => e.getAttribute('aria-label') || e.type))
    const m = f.closest('.modal'); if (m.scrollHeight > m.clientHeight + 1) bad.push('booking form scrolls inside the modal')
    f.querySelector('[aria-label="Close"]').click(); await wait(200)
    if (small.length) bad.push(`tap targets under 44px: ${small.join(', ')}`)
    return { pass: !bad.length, bad }
  })()
  // Dates tab: changing month, picking days and hiding/showing my classes never changes the page length.
  ;[...document.querySelectorAll('.ws-tabs button')].find((b) => b.textContent.trim() === 'Dates')?.click(); await wait(600)
  const dates = new Set([H()])
  const datesPane = document.querySelector('.ws-pane.on')
  for (let i = 0; i < 8; i++) { datesPane?.querySelector('[aria-label="Next month"]')?.click(); await wait(150); dates.add(H()) }
  for (const d of [...(datesPane?.querySelectorAll('.cal-day') ?? [])].filter((_, i) => i % 4 === 0)) { d.click(); await wait(20); dates.add(H()) }
  const toggle = datesPane?.querySelector('.dt-toggle input'); toggle?.click(); await wait(200); dates.add(H()); toggle?.click(); await wait(200)
  datesPane?.querySelector('.cal-layout .btn.sm')?.click(); await wait(200)
  const datesSteady = dates.size === 1
  // Workspace tabs: on desktop all four tabs give the same page length (they share one grid cell).
  const tabHeights = new Set()
  for (const b of document.querySelectorAll('.ws-tabs button')) { b.click(); await wait(400); tabHeights.add(H()) }
  document.querySelector('.ws-tabs button')?.click(); await wait(300)
  // nothing from a hidden tab may show through on another tab
  const leaks = [...document.querySelectorAll('.ws-pane:not(.on) *')].filter((el) => el.checkVisibility?.({ visibilityProperty: true }) && el.getBoundingClientRect().height > 0).map((el) => el.className || el.tagName).slice(0, 5)
  const tabsSteady = (innerWidth <= 900 || tabHeights.size === 1) && !leaks.length
  const helpSideways = document.documentElement.scrollWidth > window.innerWidth
  const helpPass = help.heights.size === 1 && !help.spills.length && !help.smallTargets.length && !helpSideways
  return { width: innerWidth, pass: heights.size === 1 && !spills.length && !overflowingRows.length && !sideways && ['aligned', 'stacked'].includes(hero) && helpPass && tabsSteady && datesSteady && toolsAlign.pass,
    heights: [...heights], spills, overflowingRows, sideways, hero, tabHeights: [...tabHeights], leaks, datesHeights: [...dates], toolsAlign,
    help: { pass: helpPass, heights: [...help.heights], spills: help.spills, smallTargets: help.smallTargets, sideways: helpSideways } }
})()
