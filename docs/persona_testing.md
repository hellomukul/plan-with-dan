# Simulated persona testing (Oct 24, 2026)

Six AI tester agents each played one SOM student. Each one used the real local app and the real model through the same API the website uses, and checked the answers against `data/yale_som_classes.json` and `backend/rules.py`.

**This is simulated feedback, not a real user test.** The pilot with a classmate is separate (`docs/user_test.md`).

## Personas and AI spend

| Persona | Focus | AI spend |
|---|---|---|
| Priya: first-year MBA, healthcare consulting, anxious about bidding, mostly on her phone | Desk, bidding, mobile | $0.0098 |
| Marcus: second-year, ex-PM, power user | Units, Leadership requirement, shortcuts, the ICS feed | $0.0095 |
| Wei: international first-year, ex-IB, tight budget | Global Studies costs, clarity, AI news | $0.0817 (two news questions: $0.075) |
| Dana / Sam / blank: EMBA, MMS, and a user who skipped onboarding | Non-MBA rules, edge cases, authorization | $0.0105 |
| Jordan: skeptical security tester | Injection, auth, privacy claims, spend caps | $0.0337 |
| Aisha: nonprofit career switcher | Impact and climate recommendations, chat memory, calendar import | $0.0098 |

Total: about **$0.155** for six full test sessions.

## What held up

- **Clashes and units:** half-term clash logic, the more-than-24-units rule, Leadership status switching on and off.
- **Access control:** reading or changing another student's plan, actions, desk or calendar returns 404. Undo twice is safe. Calendar token rotation works.
- **Sign-in:** logout invalidates the session. The cookie is HttpOnly and SameSite=Lax.
- **Web protections:** CSP, X-Frame-Options and nosniff are set. Path traversal is blocked. Export contains no password hashes or tokens. Delete requires the password.
- **Calendar feed (ICS):** valid. Correct timezone across daylight-saving changes, break days excluded, stable event IDs, meeting counts that match the app.
- **Injection:** regex screening blocks direct attempts at $0. Paraphrased, Spanish and role-play attempts were stopped by the provider's filter or by Dan. No system prompt leaked.
- **Recommender:** every quoted line was found word-for-word in the course description. News answers had dated, linked sources.

## Bugs found, ranked (verified in code or data)

**P0: wrong or untrustworthy output a student would act on**

1. **First-year Spring core isn't counted** (MGT 408/420/421/422/423/425/430, 13 units). Units, clash checks, desk cards and the recommender all ignore it. Students are told to add 16 units when they may already be at about 30, over the 24-unit cap. *(Priya, Wei, Aisha)*
2. **Chat "Add to plan" can add the wrong section.** `_resolve()` looks up by course number with no term or program filter, so it proposed a Fall, EMBA-only, already-ended section. The API also accepts sections from another program. *(Marcus, Priya, Dana, Jordan)*
3. **Global Studies options are stale or missing.**
   - All 27 Global Network Week sections ran Oct 19–23, 2026, are hidden in the data, and can still be added.
   - The free online course option (SNOC) shows no courses, because the rule matches "global network" but the courses are titled "GNAM:".
   - IE shows as a "Strong fit" when GSA days are already used.
   - GSE India is recommended after its application closed. *(Wei, Aisha, Marcus, Priya)*
4. **Signup reveals whether an email is registered.** The response differs and the timing differs (1 ms vs 25 ms), which contradicts the README and report claim. *(Jordan)*
5. **One profile string can break Recommend.** A provider content-filter error causes a 500 in Recommend. Provider-filtered chat messages are stored and replayed. Profile goal and name text isn't screened or fenced in the desk and Critic prompts. *(Jordan, Dana)*
6. **On phones, Bid coach, Global studies, Catalog, Profile and Sign out can't be reached** from the 5-tab bottom bar. *(Priya)*
7. **Non-MBA programs are handled wrongly.** Eligibility only checks a course's first section, so EMBA and MMS sections are hidden (for example MGT 879 E1). MBA rules (16 units, Leadership, Global Studies, 72 units) are applied to every program. *(Dana, Sam)*
8. **Rule misfires.**
   - Second-years are told about the 16-unit minimum, which only applies to the first three terms.
   - The week review mixes session-1 and session-2 courses.
   - Requirements show "Done" when a course is only planned.
   - Marking a GNW done doesn't deduct GSA days. *(Marcus, Priya)*

**P1: quality and polish**

- Schedule preferences reach the model as raw minutes, so "not before 10" became "after 6:00 AM".
- The Planner can't propose adds.
- Course lists in tools are cut at 3 or 6 entries, so Dan doubted that real IE countries are offered.
- Chat history keeps only 400 characters per message, so Dan forgets earlier course lists.
- **Bid data:**
  - SAMPLE rows change the point split.
  - A single report exposes one student's exact bid.
  - One student can post unlimited duplicate reports.
  - `term_code` is free text.
- **Fit chips:**
  - Topic labels count as "description" matches, giving false "Matches: climate" chips.
  - Filler words show up as matches ("between", "hand", "system").
  - "PE / VC" is dropped entirely.
  - Phrases like "social enterprise" and "impact investing" aren't matched as phrases.
- **Undo and the action log:**
  - Undoing a remove can duplicate a course.
  - An empty update is logged as a change.
  - `added_by` can be spoofed by the client.
- **Calendar:**
  - The Jan 29 make-up day (Monday schedule) isn't modelled.
  - The per-class Google link doesn't skip break days.
  - Multi-day events show as single days.
- **Shortcuts:** "G G" doesn't work, and ⌘K doesn't scroll to the highlighted item.
- **Robustness:**
  - Malformed preferences cause a 500 on best fits.
  - Courses hidden by time preferences give no notice.
  - Fall best fits still offers courses that have already ended.

## Fix status (Oct 24, night): all P0 and P1 bugs fixed

| # | Bug | Fix | Test |
|---|---|---|---|
| 1 | Spring core not counted | `planning.core_load`: 13 spring core units count in units, desk cards, best fits, the recommender and chat tools. Clash checks include the core when the cohort's sections are known. | `test_spring_core_counts_13_units_for_first_years` |
| 2 | Wrong section from chat or the API | `tools._resolve` keeps only current offerings open to the student's program, Spring first. The API rejects sections from another program and sections that have ended. `suggest_add` refuses courses that are completed, already planned or clashing. | `test_tools_resolve_only_current_sections_for_program`, `test_api_rejects_other_program_ended_and_empty_changes` |
| 3 | Stale Global Studies options | <ul><li>Past and hidden offerings are skipped.</li><li>SNOC now matches "GNAM:".</li><li>IE only shows with all 10 GSA days unused.</li><li>One trip at a time.</li><li>GSE India is marked closed.</li></ul> | `test_global_studies_options_are_current` |
| 4 | Signup reveals registered emails | Equal timing (both paths hash). README and report now say plainly that signup can't fully hide an existing email without verification. | `test_signup_existing_email_is_generic` |
| 5 | One profile string breaks Recommend | <ul><li>Recommend falls back to keyword picks when the provider fails.</li><li>Provider-filtered chat messages are marked blocked and never replayed.</li><li>Goal and background text is screened on save.</li><li>Name and goals are fenced in the desk and Critic prompts.</li></ul> | `test_profile_validation_and_screening` |
| 6 | Pages unreachable on phones | A "More" tab with every page, plus Profile, Privacy and Sign out | browser check, 375px |
| 7 | Non-MBA programs | <ul><li>Eligibility checks every section.</li><li>MBA rules are applied only to MBA students.</li><li>Other programs see an honest "not modelled" note.</li><li>Program-aware ⌘K and Catalog filter.</li></ul> | `test_program_aware_eligibility_and_strict_sections`, desk test |
| 8 | Rule misfires | <ul><li>The 16-unit minimum applies only to the first three terms.</li><li>The week review is split by session.</li><li>Requirements distinguish "Planned, not done" from "Done".</li><li>Done GNW/IE choices deduct GSA days.</li></ul> | `test_requirements_planned_is_not_done_and_gsa_is_deducted` |

**P1 fixes:**
- **Preferences:** sent to the model in words.
- **Planner:** can search and suggest adds.
- **Tool and chat limits:** no tool-list truncation; chat memory is 1,500 characters per message.
- **Bid data:**
  - Stats hidden below 3 real reports.
  - One report per student, course and term.
  - Term restricted to Fall 2026 or Spring 2027; points capped.
  - SAMPLE rows ignored in the split.
- **Fit chips:** the course title and description only; filler words removed; PE/VC expanded; phrase matching.
- **Undo and the plan log:** undo never duplicates and says when there's nothing to undo; an empty update returns 400.
- **Calendar:**
  - The make-up day is modelled.
  - Multi-day events cover every day.
  - The Google link warns that it doesn't skip breaks.
- **Shortcuts:** "G G" and ⌘K scrolling fixed.
- **Robustness:**
  - Typed preferences (malformed input returns 422, not 500).
  - A notice when courses are hidden by preferences.
  - Ended sections never offered.
- **Other:**
  - Web-search cost reserved before News Desk runs.
  - Empty or long messages get a neutral reply.
  - Dev origins trusted only on localhost.
  - Expired sessions purged.

**Still open:** `added_by` is a client-sent label ("student" or "dan"). It only changes the action log's wording, never permissions.

## Top feature ideas (across personas)

1. **Auction explainer:** a 60-second mock auction, an auction-day checklist and countdown, and backup plans for "what if I lose". *(Priya)*
2. **Quant-intensity badge** and a "no finance background" filter. *(Aisha)*
3. **Out-of-pocket cost estimate** for each Global Studies option (airfare plus the per-diem gap), with "Fits your GSA days" instead of "budget". *(Wei)*
4. **Side-by-side what-if spring plans (A/B)** with units, Leadership and clash status. *(Marcus)*
5. **Recruiting-aware timetable:** an "evenings free" preference and recruiting-week warnings. *(Wei, Priya)*
6. **⌘K actions** (add, undo, switch section) and a "?" shortcut sheet. *(Marcus)*
7. **Program-aware requirements** for EMBA, MMS and MAM, with an honest "unknown" fallback. *(Dana, Sam)*
8. **Glossary and plain-English mode** for GSA, LDR, SNOC, per-diem and similar terms. *(Wei)*
9. **Career-track bundles:** healthcare consulting, healthcare PE, impact investing. *(Priya, Aisha)*
10. **Trust features:** "what will be sent to the AI" preview, active sessions, revoke all sessions. *(Jordan)*
