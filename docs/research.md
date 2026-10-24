# Research notes: Plan with Dan (checked Oct 24, 2026)

Five research passes ran before building: registration and bidding, Global Studies and calendar rules, competing tools, an audit of the lecture 8 base app, and the auth/calendar/hosting stack.

Confidence labels: **[Official]** means a Yale page or public Yale data feed. **[Press]** means students or the press. **[Inferred]** means our own reading.

## 1. How SOM registration works

**The course auction**
- Electives, International Experience (IE), Global Network Week (GNW) and Small Network Online Courses (SNOC) all go through the regular elective course auction. SNOC adds a faculty selection step. [Official] https://catalog.yale.edu/management/full-time-mba/mba-curriculum/
- The auction app is listed as `bidding.som.yale.edu` and needs a NetID. [Official] https://confluence.som.yale.edu/display/SC/Course+Auction
- No public page gives the current points budget, the rounds or the pricing rule.
  - The Yale Daily News (2015) reported 500 points for second-years and 300 for first-years, and point inflation. That is old and may be outdated. [Press] https://yaledailynews.com/blog/2015/01/23/som-students-experience-shopping-woes/
  - The same article cites one course with 126 bids for 70 seats. [Press]

**Bid history is not public**
- The only clue is a 2019 SOM admissions blog quoting a student who tells peers to "check out the previous course bidding history". It sits behind NetID login. [Official / Inferred] https://som.yale.edu/blog/answers-to-your-questions-about-yale-som-and-the-admissions-process
- **Decision:** the app crowdsources bid outcomes from students. Demo rows are clearly labelled SAMPLE. Nothing is shown as historical that isn't.

**Public course feed**
- Endpoint: `POST https://som.yale.edu/courses/session-items/{termCode}` (202603 = Fall 2026, 202701 = Spring 2027).
- Fields include `bidOrPermission`, `allowBid`, `enrollmentLimit`, `courseAttributes` (e.g. MGLD, MGGS, probably the Leadership and Global Studies flags) and `prerequisite`. [Official data]
- Spring 2027 already has 217 sections: 130 bid, 35 core, 7 permission.

**Rules a planner must respect** [Official]
- 72 units to graduate: about 30.5 from the core, at least 41.5 from electives.
- At least 16 graded units in each of the first three terms. A heavy term does not make up for a light one.
- More than 24 units in a term needs approval.
- Overlapping courses are not allowed. The registrar removes one after add/drop.
- Add/drop lasts one week. Changes after that use a late form and a $25 fee.
- Sources: https://catalog.yale.edu/management/full-time-mba/mba-degree-requirements/ and https://catalog.yale.edu/management/rights-responsibilities-students/course-policies-residential-masters-degree-programs/
- Cross-registration goes through Yale Hub. Yale College and graduate school courses usually count as 4 units. 75% of SOM students take at least one class elsewhere at Yale. https://registrar.yale.edu/registration/cross-school-course-registration-processes

## 2. Global Studies Requirement (GSR)

Complete **one** option before graduation. Each student has a Global Studies Account (GSA) of **10 funded days**. It is not replenished, and unused days are forfeited. [Official] https://som.yale.edu/global-studies-requirement and https://catalog.yale.edu/management/tuition-fees/global-studies-financial-support/

| Option | Units | Timing | GSA days | Key rule |
|---|---|---|---|---|
| International Experience (IE) | 4 | Half a term in class, then a 10-day trip (spring travel Mar 8–19, 2027) | 10 | You can only bid if all 10 GSA days are unused |
| Global Network Week (GNW) | 1.5 | Mar 8–12, 2027 and Oct 18–22, 2027 | 5 | Through the auction. The subvention covers up to 2 GNWs |
| SNOC (Global Network online course) | 2 or 4 | Online, synchronous, team projects | 0 | Auction, then the instructor selects. A place is not guaranteed |
| GSE India (MGT 529) | 2 | Fall-2 to Spring-1, 2 weeks of fieldwork in January | 10 | Separate application (2026 window: Jun 1–12) |
| Spring GSE (MGT 865) | – | Spring-1 to Spring-2, 1 week of fieldwork in March | 5 | Application |
| International exchange | Partner school's courses | One term in year 2 | 10 | Partners: LSE, LBS, HEC, IESE, NUS, Tsinghua SEM. You can petition for other GNAM schools |

**Funding:** GNW and exchange get 50% of lodging and meals at State Department per-diem rates. For IE and GSE, SOM pays lodging and about half of meals, and **students pay their own airfare**.

**Core curriculum conflict:** the 2026–27 Bulletin lists *AI Foundations for Managers* (2 units) in the core and drops *Global Virtual Teams*. The Year-1 web page still shows the old list. https://catalog.yale.edu/management/full-time-mba/mba-curriculum/

## 3. Spring 2027 calendar

Source: https://som.yale.edu/programs/mba/curriculum/academic-calendar

| Date | Event |
|---|---|
| Jan 5 | Add/drop opens |
| Jan 19 | Classes begin |
| Jan 26 | Add/drop ends for session-1 and full-term courses |
| Mar 2–5 | Session-1 ends, with finals |
| Mar 8–19 | IE and GNW, no classes |
| Mar 22 | Session-2 begins |
| Mar 29, 5 p.m. | Add/drop ends for session-2 |
| May 4–7 | Classes end |
| May 5–11 | Finals |
| May 24 | Commencement |

Spring auction dates are **not published publicly**.

## 4. Student pain points

1. **Bidding anxiety.** A 2018 SOM award winner said the auction was "causing enormous stress, anxiety, and frustration" and was straining friendships. [Press] https://poetsandquants.com/2018/05/06/2018-best-mbas-hosanna-odhner-yale-som/
2. **No price signal.** Past clearing prices are hidden behind a login at SOM. Haas does not keep cutoffs at all. Booth students ask for history inside iBid. https://haas.berkeley.edu/mba/academics/registration-enrollment/bidding/ and https://www.chibus.com/perspectives/2024/2/12/is-bid-inflation-real-a-consultants-answer-it-depends
3. **Scarce points.** One oversubscribed course forces low-demand choices everywhere else. https://www.mbamission.com/blog/mba-news-bidding-for-class-at-business-school/
4. **Half-semester clashes.** Session-1, session-2 and full-term courses overlap in ways that are hard to see, and overlap is not allowed. [Official / Inferred]
5. **Requirements tracked in many places.** GSR, Leadership, the 16-unit minimum and cross-school units all live in separate places, some only on the internal site.
6. **The global option is a hidden budget decision.** The 10 GSA days are use-it-or-lose-it, an IE needs all 10, and you pay your own airfare.
7. **Information is scattered.** Students juggle the public directory, the auction app, Canvas, Yale Hub, forms, the wiki and 12twenty. A student built MySOMClasses because no official planner existed. https://www.mysomclasses.com/
8. **Recruiting collides with classes.** The career office cleared a week of core classes for recruiting in January 2024. https://cdo.som.yale.edu/?p=39912
9. **Choosing by popularity instead of goals.** http://archive.harbus.org/2023/landing-your-dream-ec-schedule/

## 5. What already exists

| Product | What it does well | What it lacks for an SOM MBA student |
|---|---|---|
| CourseTable (coursetable.com) | Worksheets, conflict hiding, Google/ICS export, friends, evaluations since 2009, Yale CAS login | SOM evaluations are probably absent. No bidding, no SOM requirements (core/GSR/LDR), no recommender. Half-term handling unverified |
| MySOMClasses (mysomclasses.com) | A student-built SOM schedule viewer | No accounts, agents, requirements or bid data (to verify) |
| s-zhang/yale-som-course-picker (GitHub) | Uses the public SOM feed | Picker only |
| SOM course directory and auction app | The official listing and the auction | No planning, clash help, history or recommendations |
| Coursicle | Generic schedule builder with seat alerts | Nothing SOM-specific |
| Stellic | Degree audit and multi-year plans (licensed per school) | Yale does not use it. No bidding |
| Wharton Course Match, Booth iBid, Kellogg BidReg | Allocation built into each school's own system | Only at those schools |
| ChatGPT, Claude, Gemini, Yale Clarity | Good conversation about goals | No SOM catalog, so they invent courses and times. Research (Aurora, arXiv 2602.17999) documents chatbots inventing courses |

**The gap:** nothing combines SOM requirements, the GSR and GSA budget, half-term clashes, bid history, and an AI recommender that can only name real catalog courses.

**Privacy (FERPA):** plans a student enters into an independent app are probably not FERPA records, but treat them as sensitive. This is not legal advice.

## 6. Tech decisions

| Area | Choice | Why |
|---|---|---|
| Auth | Argon2id (pwdlib), HttpOnly SameSite=Lax session cookie storing only the token's SHA-256, login/signup rate limit of 5 per minute per IP, same-origin serving | `onrender.com` is a public suffix, so split frontend/backend services would be cross-site |
| Persistence | SQLModel, with `DATABASE_URL` defaulting to SQLite | Render Free's filesystem is wiped on restart. Neon free Postgres does not expire; Render free Postgres expires after 30 days |
| Calendar | Secret-token ICS subscription feed, .ics download, and Google template links | Works in Google, Outlook and Apple with no OAuth keys. Google refreshes slowly (8–24 h) |
| Full API calendar sync | Rejected | Needs OAuth client keys, Google verification and a 100-user cap |
| Deploy | One Render web service: FastAPI serves the built React app | Same-origin cookies, one URL |

## 7. Issues found in the lecture 8 base app (fixed here)

- The `.env` was only checked one level up, and the model was hardcoded to `gpt-6-astra` (100x the price of `gpt-6-luna`).
- `search_courses` sent the whole catalog (~12k tokens) to the model on every call.
- The term-overlap logic treated `spring` vs `spring-1` as no clash, and `fall` vs `spring` as a clash.
- The ICS export had no DTSTAMP or VTIMEZONE, no escaping, a spurious first event, and UIDs that collide across terms.
- Course grouping ignored the term, so fall and spring sections merged.
- CORS reflected any origin with credentials.
- Plans lived only in localStorage.
