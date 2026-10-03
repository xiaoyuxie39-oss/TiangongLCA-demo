# Classroom results app

Separate companion to the offline TianGong calculator. The lecture uses one classroom with a six-digit code and no group-count limit. Students join with a group number or name, save one paired SVE/Biopile answer, and may edit until the facilitator locks the classroom. An eight-digit recovery PIN lets a group switch devices. The public board shows only submission progress until the facilitator reveals anonymised aggregates. The teacher can inspect raw entries and export CSV.

## Local preview

Requires Node.js 22+ with `node:sqlite` (tested with Node 26). No package install is needed for the local preview.

```sh
cd classroom
npm run catalog
npm test
npm run dev:local
```

Open `http://localhost:8787/facilitator.html`. The local preview generates a random eight-digit teacher PIN in `classroom/.local/admin-pin.txt` and creates `classroom/.local/classroom.sqlite`. Both paths are gitignored. Read the PIN locally and enter it in the teacher page. The classroom is created automatically. Open the student and board links in separate browser windows. To test another device on the same local network, set `CLASSROOM_HOST=0.0.0.0` and use the host's LAN address rather than `localhost`.

## ChatGPT Sites deployment

The production classroom runs as a separate ChatGPT Site with a D1 database. It does not alter the offline calculator's GitHub Pages workflow. The Site is identified by `classroom/.openai/hosting.json`; deployment credentials, the facilitator PIN, and the cookie-signing secret are managed in Sites and must never be committed. Database migrations are generated from `db/schema.ts` into `drizzle/`.

Before publishing an update, run `npm ci`, `npm run catalog`, `npm test`, `npm run db:generate` when the schema changes, and `npm run build:sites`. The Sites publishing workflow pushes this directory as the Site's source and packages `dist/`, including the database migration. `dist/` is generated and ignored by Git.

To run the lecture, open the facilitator page and sign in with the eight-digit PIN. The one classroom is created automatically. Share its student URL or six-digit code. Students use a group number or name, answer independently, and can edit until the facilitator locks submissions. Lock and reveal the distribution when the discussion starts. The public board refreshes every five seconds. The teacher can download raw entries as CSV.

The electricity list is every grid mix the calculator offers (`bundle.producers` for the electricity flow, national mix first), so `npm run catalog` must follow every bundle rebuild. Totals above 1,000 t are refused as "looks like kg" (the calculator shows kg; the largest real total is about 142 t). The projected board and the facilitator table show province names; the CSV keeps `provider_name` and `provider_uuid`. A git push does not update the Site: publish it again after any change here.

A session code is admission convenience, not proof of identity. For graded work, use an institution-approved roster and identity system. The public API never returns group names, rationales, or raw answers. Provider summaries with fewer than three groups hide the median. Responses include the bundle snapshot, method UUID, electricity flow UUID, and chosen provider UUID. Student-reported totals are labelled as reports rather than independently verified values.
