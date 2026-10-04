# Domain docs

How the engineering skills read this repo's domain documentation. The repo is single-context.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term exactly as `GLOSSARY.md` defines it.

If the concept you need isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly and give the reason to reopen it:

> _Contradicts ADR 0008 (copy-block order and rounding), but worth reopening because…_
