# QA checklist: what "tested" means before anything is called done

Functional checks (API, pytest, "did the right course come back?") are not enough on their own. They passed on the first version of the course explorer, while the page itself was visibly broken. Every UI change now also goes through the checks below, **at three widths: 1440, 1024 and 375 px**.

## 1. Layout audit (automated)

Run `qa/layout-audit.js` in the browser at each width, on a fresh page (`localStorage.clear()` first). It acts like a student:
- searches several courses, opens them and adds them, including one that clashes in every section and an empty search;
- switches terms;
- removes every course.

It **fails** if:
- the page length changes at any step (the page "shakes");
- any button, select, tag or pill sits outside its card;
- any course row is wider than its box;
- the page scrolls sideways;
- in the hero, Dan's card doesn't share top and bottom edges with the left column on desktop, or doesn't stack under it on a phone;
- on the Tools tab, picking any Get help option changes the page length, anything spills out of a Get help card, or a pill or the main button is shorter than 44 px;
- on desktop (wider than 900 px), switching between My plan, Dates, Tools and Requirements changes the page length, or anything from a hidden tab shows through. On phones each tab keeps its natural height; the tab bar stays put and even the shortest tab is long enough that the view never jumps.

- on the Dates tab (and the signed-in Calendar page), changing month, picking a day or hiding/showing your classes changes the page length. Every month has six week rows, day cells have a fixed height (116 px, 60 px on phones; on the desktop Dates tab the rows share the panel height), and the selected-day list is a fixed 168 px box.

Also sweep the sentence picker: every program × year × cohort × term (40 combinations) must give the same page length at each width. Things that used to break it: a two-line note that didn't fit its reserved space (reserve whole lines with `lh`, not `em`), the "no published time" list wrapping, the "I'm an MBA joint-degree first year in Gold" sentence wrapping on phones, and the hero chat's "Answering for" line wrapping.

Last run (Oct 25, production build, after the Updates 2.0 work: Requirements, Dates calendar, week-builder recommendation, Tools tab redesign, faculty search). The audit now also covers the Dates calendar and the Tools tab alignment checks.

| Width | Page height, every step + all 4 tabs + Dates calendar | Get help (all 10 options) | Picker sweep | Spills | Sideways scroll |
|---|---|---|---|---|---|
| 1440 | 3576 px | 3576 px | 3576 px | 0 | no |
| 1024 | 3621 px | 3621 px | 3621 px | 0 | no |
| 375 | 5604 px (My plan; tabs 5604 / 5553 / 6152 / 5904) | 6152 px | one height per combination | 0 | no, also right after a fresh load |

## 2. Look at it (screenshots)

Take a screenshot of each changed section **with real content in it**: a full course list, a long title, a clash, an open course card. An empty first screen isn't enough. Check that:
- nothing overlaps or hides other content (no floating panels over the page);
- text is readable, and long text is shortened with "…", not cut off mid-control;
- every decision is visible without hovering (open/not open, fits/clashes, and why).

## 3. Behaviour with real queries

- Course numbers in every form: `MGT 410`, `mgt410`, `410`.
- A professor's last name, and a first name that is also part of another name (`nathan` vs `Jonathan`).
- A title phrase (`private equity`) and nonsense (`zzzz`) for the empty state.
- A course from another program (`MGT 405`, EMBA): the specific reason shows.
- A course that clashes in every section (`MGT 525` for a Gold first-year in spring): each section names the course it clashes with.

## 4. Honesty

No promise on the page that the app doesn't keep. For example, "Bid coach uses your ranking" was removed because it doesn't.
