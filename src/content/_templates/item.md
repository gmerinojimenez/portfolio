---
# Copy to src/content/items/es/<id>.md (the file name is the id, kebab-case).
# Only `type` and `title` are required; everything else can be filled in later.
# While status is "draft" the item shows up in `pnpm dev` but not in production.
# To publish, set `status: published`: then `summary`, `tags` and `from` are required.

type: project # app | project | education | post | oss
title: Title of the item
status: draft # draft | published

from: 2021-03 # YYYY, YYYY-MM or YYYY-MM-DD
to: 2022-06 # same format, or `present`

summary: One line, shown on the card and used by the AI to decide what to read.
tags: [android, kotlin] # topics and technologies
topic: android # main topic: decides the cluster on the map (optional)

company: some-company-id # file name (without .yaml) in src/content/companies/
app: some-app-id # id of the app item this one belongs to (optional)
importance: 3 # 1 (minor) to 5 (flagship): node size on the map
related: [] # ids of other items
role: Android developer

links:
  - label: Case study
    url: https://example.com
    kind: case-study # free-form icon hint: medium, github, play-store...
---

Free Markdown body: context, problem, decisions, results.

<!--
English version: src/content/items/en/<same-id>.md with the same `type`, plus
title, summary, tags and body in English, and `review: pending` until you have
read the translation, then `review: reviewed`. Structure (dates, company,
related...) is always read from the Spanish file.
-->
