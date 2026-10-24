# Design and product brief: redesign proposal (Oct 24, 2026)

This brief combines three research passes: modern product design, home pages built around recommendations, and AI chief-of-staff products. It is research and a proposal only. Nothing in it is built yet.

## Why the current home page feels messy

`Home.tsx` puts about 12 equally weighted boxes on screen at once:
- a glowing hero card with two floating mascots
- 4 identical stat cards
- a deadlines card
- 6 emoji tiles

`styles.css` uses 7 accent colours, gives every card the same 22px radius, and adds pink glow shadows. Home alone shows about 11 emoji.

NN/g's guidance points the other way:
- 3 type sizes or fewer
- 2 large elements or fewer
- about 2 primary and 2 secondary colours ([NN/g, visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/))

It also finds that rings and donuts are harder to read than bars ([NN/g, dashboards](https://www.nngroup.com/articles/dashboards-preattentive/)), and that cards are less scannable than lists when the items are similar ([NN/g, cards](https://www.nngroup.com/articles/cards-component/)).

Dark mode with glows, gradient text, Inter, and a uniform grid of rounded cards are also widely called out as "AI slop" tells. That label is community opinion, not research.

## Recommended direction: "Quiet Pink"

Calm and keyboard-first, in the style of Linear, Raycast and Notion Calendar.

- **Why:**
  - Linear's 2026 refresh aimed for "a calmer interface" and states the principle "Don't compete for attention you haven't earned" ([Linear](https://linear.app/now/behind-the-latest-design-refresh)).
  - Superhuman's 100ms rule says every interaction should feel instant ([Superhuman](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
  - MBA students already use tools built this way.
  - It keeps the project's black-and-pink default.
- **Palette:**
  - Warm near-black backgrounds: `#0B0B0C` base, `#141416` surface, `#1C1C1F` raised, `#27272B` border.
  - Text `#EDEDEF`, muted text `#8B8B93`.
  - One accent, **pink `#FF4FA3`**.
  - Colours used only for status: green `#3DD68C`, amber `#F5B544`, red `#FF5C5C`.
  - Remove lilac, lime and sky.
- **Type:** Geist for the interface and Geist Mono for course codes, times and units, with 3 sizes plus one display size.
- **Shape:** 10–12px corner radius, 1px borders, no glows.
- **Icons:** one icon set (Lucide), always with text labels. No emoji in headings or buttons.
- **Motion:** 120–200ms, only when something changes state (course added, clash fixed). Respect the system's reduce-motion setting.
- **Mascot:** a small Handsome Dan avatar in chat and empty states only. One celebration moment, when bids are placed. Labubus come off the core screens.
- **Two playful moments borrowed from the bolder "Expressive" option:**
  - Dan celebrates when bids are submitted.
  - A shareable "Your Spring 2027 Wrapped" schedule card.

**Alternatives:**
- **B, "Yale Editorial":** warm paper background, Instrument Serif headlines, Yale Blue with pink actions, light mode first. This breaks the black-and-pink default.
- **C, "Expressive Bulldog":** Material 3 Expressive meets Duolingo. Bold solid colour blocks, Bricolage Grotesque, a full character system for Dan. The risk is that it reads as made for undergrads.
  - Google reports up to 87% preference for this style among 18–24-year-olds, but a "strong minority" preferred calmer designs ([Google Design](https://design.google/library/expressive-material-design-google-research)).

## Home page: "Dan's Desk" (chief of staff) plus "Your best fits"

**Desktop layout:** a main column plus a supporting side pane (Material's canonical "supporting pane" layout).

1. **One-line header:** greeting, planning context, a ⌘K hint and the Dan avatar.
2. **Brief:** two or three sentences written by the LLM, but only from facts computed in code. Cached once per day.
3. **Decisions needed:** up to 3 rows, each with a due date and one action (Review / Compare / Fix). Snooze and dismiss are recorded and shape the next brief.
4. **Your best fits:** 3 cards.
   - Each card shows a fit **label** (Strong fit, Good fit, Worth a look), never a percentage.
   - At most 2 reason chips.
   - Time, units and clash status.
   - **Demand shown separately** from fit.
   - Buttons: Add to plan, Not for me, and Why? (the Why? panel shows the quoted line from the course description and one counter-reason).
5. **Side pane:**
   - Next up: the 2 nearest deadlines.
   - Your plan: units, electives and Global Studies days as **bars**; Leadership and clashes as text.
6. **Below the fold:** themed rows such as "Because you want product management", "Counts for Leadership" and "Fits your open slots", plus the full deadline list.

**Mobile:** a single column with a deadline banner (only when a deadline is 3 days away or less). One full-width fit card with the next one peeking in from the edge, a plan strip, Next up, and a bottom tab bar.

**Removed or demoted:** the 4 ring cards (become bars), the 6 action tiles (move to the sidebar and ⌘K), the hero mascot card (shrinks to a one-line header), and the full deadline list on Home.

### Making the fit score honest
- **Gate first, then rank.** Courses that clash, or that the student has already taken, never appear as best fits. Clashing ones go in a separate "Fits if you swap X" row.
- **Ranking inputs:**
  - Goal match: from the Curator, backed by the quoted description line
  - Requirement value: computed in code
  - Schedule fit: computed in code
  - Units: computed in code
- **Labels, not percentages:**
  - Google's People + AI Guidebook calls numeric confidence risky and says to explain *why* along with *what* ([PAIR](https://pair.withgoogle.com/chapter/explainability-trust/)).
  - Netflix's match percentage confused viewers, and in 2024 the company signalled moving toward descriptive tags ([MobileSyrup](https://mobilesyrup.com/2024/01/17/netflix-content-match-percentages-tags-report/)).
- **"Not for me" must change what's shown.** NN/g found users rarely fix bad recommendations because the effort feels too high ([NN/g](https://www.nngroup.com/articles/recommendation-expectations/)), so a dismissal has to have a visible effect.

## Chief-of-staff framing

**Competitors:**
- ChatGPT Pulse (daily cards)
- Google CC and Gemini Daily Brief, whose sections are reported as "Top of mind / FYI / Looking ahead". The Gemini brief is free for US personal accounts since Sep 2026.
- Copilot's inbox priority, which gives a reason for each priority
- Lindy, which holds any action with outside impact for approval
- Sunsama's daily and weekly rituals, with a warning when you overcommit
- Motion and Reclaim, which auto-schedule

I found no AI chief of staff for MBA students, though that rests on one search and is unverified. The generic morning brief is now a commodity, so Dan's twist should be **decisions grounded in SOM rules**: deadlines computed in code, a cited source on every card, and an approval gate before anything changes.

**Feasible by Monday with no new API keys:**
- A deterministic `chief_of_staff_scan()` that produces typed decision cards from deadlines, the plan, requirement gaps, bid status and GSA days
- A brief written by the LLM from those cards only: one call per student per day, cached
- Approve / Snooze / Dismiss, each mapped to an existing action
- An action log with undo
- Deadline events in the calendar feed

**Out of scope** (each needs OAuth or institutional access): email triage, writing to Google Calendar, Canvas, 12twenty and Slack.

**Trust measures:**
- Cap the list at 3 cards, each with a "why am I seeing this" line.
- Make dismissing a card easy.
- Never let the model invent dates.
- Avoid confirmation fatigue.
- Test a goal string with an injection attempt in it as a safety demo.
- Sources: [OWASP LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), [Levels of Autonomy for AI Agents](https://knightcolumbia.org/content/levels-of-autonomy-for-ai-agents-1), [Microsoft HAX guidelines](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/).

## Data and security gaps to close in the same pass (about 1 hour)

1. Delete my account and export my data.
2. A generic signup response, so signup doesn't reveal which emails are registered.
3. A Content-Security-Policy header.
4. Stop storing previews of blocked prompts.
5. A short privacy page explaining the Portkey/OpenAI data flow.
