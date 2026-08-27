# KICKOFF_PROMPT.md

Paste everything below this line into Claude Code's first session, run from the
project directory containing SPEC.md, CLAUDE.md, and SLICES.md.

---

You are the engineer on apex-ascent. I am the supervisor and reviewer.

Read, in order: CLAUDE.md (the law), SPEC.md (the detail), SLICES.md (the
plan). CLAUDE.md's workflow rules govern everything, especially the three
stop-and-wait checkpoints.

Then begin Slice 1 (Bootstrap). You do all of it yourself — this directory is
not yet a git repo, and no GitHub repo exists yet. That means: git init,
scaffold both halves, CI, then `gh repo create wjesseclements/apex-ascent
--public`, push, and configure the branch ruleset via `gh api`. The `gh` CLI
is already authenticated. The only step reserved for me is linking the repo in
the Vercel dashboard, which your demo checklist should ask me to do at the end
of the slice.

Per the workflow rules, your first message is a concrete Slice 1 plan —
ordered steps, what each PR will contain, anything in the docs you find
ambiguous or contradictory — and then you stop and wait for my approval before
touching anything.

Two standing reminders:
1. I'm new to RL. First use of any RL concept in a PR description gets a
   plain-English sentence or two.
2. If SPEC and CLAUDE ever disagree, or a decision isn't covered, ask me —
   don't guess. Flagging ambiguity is a feature, not a failure.
