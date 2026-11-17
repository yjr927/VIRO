# Viral

An English creative frontend for discovering TikTok references, tracking character-video production, reviewing outputs, and managing saved creations.

## Source

Adapted from [yjr927/idore_tools](https://github.com/yjr927/idore_tools). This checkout was cloned from [yjr927/VIRO](https://github.com/yjr927/VIRO), which was empty at the start of the redesign. Backend services and workflows remain in the source workspace; this repository contains the new frontend only.

## Preview and build

Run `python3 -m http.server 4173 --bind 127.0.0.1 --directory website` and open http://127.0.0.1:4173. Run `node build.mjs` to create `dist/`. No dependency installation is required.

## Interface

Discover, Studio, Review, Library, and Connections use English throughout. The palette is charcoal `#1D2426`, cool gray `#C0C9C5`, mint `#A5E7CA`, orange `#EC7318`, and gray-green `#5A6D67`.

Discovery filters, browser-local saved references, collection snapshots, source playback, local creation playback and downloads are supported. The original workspace session and revision checks are preserved for cloud actions.

## Published data

The initial English data is a saved snapshot. Refresh reloads this site's published records; it does not automatically pull later backend changes. After cloud actions, check the source workflow activity. Updating the production workspace data requires a new frontend data publication and English translation of any added observations.

OpenAI reported an insufficient quota in the saved records. TikTok upload authorization was not configured. No paid generation, upload, or publishing action to TikTok was performed during this redesign. See `website/README-source.md` for evidence provenance.
