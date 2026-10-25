# Home page v3: founder note + 3 reviewer agents (Oct 24, 2026)

**The founder's note ("AI project", 8:30 pm):**
- The right side of the hero is too big and the left too empty, so put Ask Dan in half of the hero.
- Then the old class app's "I'm a [MBA] [first year] in [Blue]" picker.
- Then tabs: Schedule + My plan, Dates, Tools, Requirements.
- Then Straight answers.
- Replace "What a free account adds" with a create-account pitch of 4 benefit cards.

**Three agents reviewed it:** a UX designer, a growth lead, and Marcus (a skeptical second-year MBA, phone first).

## Decisions

| Question | UX | Growth | Student | Decision |
|---|---|---|---|---|
| Chat in half the hero? | Yes, with safeguards | Yes: fastest path to a first answer | No, it's the thing he trusts least | **Yes, with safeguards.** It's the product's showcase. "Build my week" is the primary hero button, so the builder isn't buried. |
| Starter questions | 4, instant | 3, pre-cached per program | "a bare input + 3 chips" | **4 on desktop, 2 on phones.** Repeat first questions are served from a 6-hour server cache: instant, free, and they don't count toward the cap. |
| Waiting | A status line with elapsed time | Progress at 3 s, honesty at 10 s | — | Status line: "Reading your question → Checking SOM's course data and the Yale Bulletin → Still working: some answers take up to 15 seconds · 9s" |
| Generic answers | — | Show "Answering for: …" | — | The picker's program, year and cohort go with every visitor question, and the context pill in the chat links back to the picker. |
| Visitor cap | — | Campus Wi-Fi shares one IP | — | **Per-device cap of 15 a day** (random cookie), plus a looser per-IP cap of 60. At the cap, the card shows a calm "Dan's resting for today" message and points to what still works. |
| Two Dans | One shared thread; hide the launcher while the hero chat is visible | Same | — | One chat store (`lib/danChat.ts`). The launcher is hidden while the hero card is on screen. |
| Picker placement | Directly above the tabs, in one container | In the hero | Sticky and remembered | One sticky bar (picker + tabs). Remembered in the browser. Correct grammar ("I'm an EMBA…"). No cohort for programs that don't have one. |
| Tabs | My plan / Dates / Tools / Requirements; course search inside My plan | Rename "Tools" | "Links you need", concrete | **My plan · Dates · Tools · Requirements.** Tools has 8 confirmed official links, 4 Dan tools that need an account, and a plain-English glossary. Dates has every remaining date and "Add these to my calendar" (no account needed). |
| Account pitch | 4 cards, all true today | "Keep your plan. Let Dan watch the deadlines." | Reminders matter; chat memory doesn't | That headline, with 4 true cards: **Save your plan · Weekly deadline cards · Rule and clash checks · Calendar sync.** No email reminders, because the app doesn't send email. |
| Cut | Six features → four | AskBar, Programs band, sticker, open FAQ | — | Cut the separate Ask bar, the Programs band (now the Requirements tab), the six feature cards and the four-item trust list (now three). FAQ items now start closed. |

## Not done, and why

- **Magic-link sign-in, no password minimum (growth):** magic links need an email service, which the course rules don't allow (no extra keys). The 12-character minimum stays for security.
- **Seat or waitlist alerts, email or SMS deadline reminders (student):** this needs live seat data and a messaging service, neither of which is available.
- **Bid-round dates (student):** SOM announces them on the internal portal. The Dates tab says so.
