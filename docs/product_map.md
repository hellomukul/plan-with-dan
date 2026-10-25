# Product map: what a signed-in student can do, how, and where (Oct 25, 2026)

**Why this exists.** Student feedback after the first friends' tests:
- "What's the use of this? How should I use it? What should I do next?"
- "If I want my timetable, do I go to Course explorer, My plan or Calendar?"

The app had grown to 12 sidebar items under one "Plan" heading. Names described features ("Find courses with Elihu", "Bid coach") rather than what you get, and the timetable appeared in three places.

**The rule now.** Every page answers one student question. It sits in the step of the semester where that question comes up, and its name says what you get. `frontend/src/nav.ts` is the single source of truth: the sidebar, the phone tab bar and "More" sheet, ⌘K and the Desk's guide all read from it, so they can't disagree.

## The three steps (sidebar sections, and the "How Dan works" strip on the Desk)

| Step | The student's question | Pages (main one first) | Status shown on the Desk |
|---|---|---|---|
| **1 · Choose courses** | What should I take? | **Course picks** (ranked for your goal, every quarter left) · Course explorer (every SOM course) · Faculty · Shortlist (starred, side by side) | electives planned, courses starred |
| **2 · Plan your terms** | Does it fit, every term? | **My plan & timetable** (weekly timetable per term, every term to Spring 2028) · Calendar & deadlines (dated view, sync) | clashes, or a term under its unit minimum, or units planned |
| **3 · Lock it in** | Am I on track, and how do I get seats? | **Requirements** (Global Studies, Leadership) · Bidding (auction dates, points) | Leadership and Global status; "auction open" while it is |

The Desk marks the step the student is on ("You're here"):
- **Step 1:** no electives yet.
- **Step 2:** a clash, or a term under its minimum.
- **Step 3:** everything else.

That step's button is the blue one.

**Always there:** Dan's Desk (today, this week, your next step) and Ask Dan (any SOM question, with sources).
**Support:** Get help (who to see at SOM).
**Account, at the bottom:** Profile and goals, Privacy and data, Cost and safety, and Owner dashboard for the owner only.

## One home per thing

| You want… | Go to | Not here (and why) |
|---|---|---|
| Your weekly timetable | **My plan & timetable** | Calendar shows dates (class days, deadlines, sync), not the planning grid. The Desk shows only today's next class. |
| Courses for your goal | **Course picks** | The Course explorer is for looking things up yourself. |
| A specific course or professor | **Course explorer** / Faculty | |
| Deadlines, or Google/Outlook sync | **Calendar & deadlines** | |
| Units per term | **My plan & timetable** | Requirements covers Global Studies and Leadership. |
| Auction help | **Bidding** | |

## Renames

| Before | After | Why |
|---|---|---|
| Find courses with Elihu | **Course picks** | Says what you get. Elihu stays as the guide on the page. |
| My plan | **My plan & timetable** | Answers "where's my timetable?" |
| Calendar | **Calendar & deadlines** | Dates, not the weekly grid. |
| Global & Leadership | **Requirements** | The student's word for it. |
| Bid coach | **Bidding** | Plain. |
| (Desk) Progress rings | Statuses in the three steps | One place for "where do I stand". |
| (Desk) This week's timetable | Removed | The timetable has one home. |

## The Desk, top to bottom

1. **Greeting.**
2. **Your next step:** one card, one primary button.
3. **Dan's one-line brief.**
4. **How Dan works:** the three steps, each with its status, its main page and its other pages.
5. **Today and the next deadline:** the next class with a live countdown, and the auction or next deadline.
6. **This week:** at most three decisions and deadlines, each with one action.
7. **Where to find it:** eight "I want to…" questions, each opening the one page that does it.
