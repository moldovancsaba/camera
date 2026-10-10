# Execution order (owner answers of 2026-10-10)

The owner sorted the open work with three letters: **A** asap, **I** important, **P** postpone. The order of every card is the **Order** column of the project board (#24, lowest first; A cards are 10 to 99, I cards 100 to 199, P cards 200 and up); this file only keeps the rules and the schedule, because a second list drifts (`TASKLIST.md`). Board buckets: A is Todo (NEXT) and the cards being worked on are In Progress (NOW), I is Backlog (SOONER), P is Roadmap (LATER) or Ideabank.

## The rules the order follows
1. **A before I before P**, and inside a letter by the Order number.
2. **The match on Friday 2026-10-16 decides the timing, not the priority:** the guest capture path, the live giant screen and the approver's screens are frozen from Wednesday 14 October (only fixes found in the rehearsal). Anything an A card needs there is built so that **no event changes until an editor switches it on** (defaults are today's behaviour), or it waits for Saturday 17 October.
3. **Nothing is deleted from the database** by any step without the owner's go, and nothing runs against production data except through an admin button with a dry run first.
4. **One pull request per step**, the full CI chain locally, `Verify` green, merged, looked at live (read-only), the issue ticked and commented, the guide in the messmass repo updated.

## The waves
- **Wave 1, Sunday 11 to Tuesday 14 October (before the freeze), parallel tracks:** #557 try-on removal (R0 inventory, tag and document; R1 admin; R2 server; R3 the guest path only if it is verified in a browser by Tuesday), #521 analytics phase 1 (on existing data; the capture-path part waits), #178 and #559/#382 (timeouts, the follow-up e-mail job, long share links), #558 consent settings (defaults as today), #476 the rest of the slideshow work behind switches that start off, #326/#327/#332/#412 welcome screen and default slideshow, #415/#418 the admin kit and the gate (new code only, screens move later), small items #383, #430, #181, #352 Hungarian leftovers.
- **Freeze, Wednesday 14 to Friday 16 October:** the approver rehearsal (owner task 287), fixes only.
- **Wave 2, from Saturday 17 October:** #521 phase 2 (journey recording, stop storing the photo IP address), the try-on removal's guest-path and cleanup phases if they were not done, the admin screens moved onto the kit and #421 (frames fail-safe), the production runs (#476 screen-sized pictures, the welcome-screen backfill) with their dry runs, then the I cards in Order, then the P cards.
