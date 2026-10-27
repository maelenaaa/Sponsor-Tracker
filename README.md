# Sponsor desk

A small web app for managing sponsors, tracking what each sponsor is owed, and deciding every week who to feature next.

Open it once a week and it tells you:

- which sponsor to feature on the website, and why
- which deliverables are outstanding or overdue
- when each sponsor was last featured on the website and on LinkedIn
- which LinkedIn posts are due next

![Dashboard](docs/screenshots/dashboard.png)

## How it fits together

| Piece | Choice | Why |
| --- | --- | --- |
| App | Next.js 14 (App Router, TypeScript) | One project, deploys to Vercel with no extra setup |
| Database | PostgreSQL. Supabase is the suggested host | Free tier is enough, persists across devices, standard SQL |
| Sign-in | One shared password | You are the only user. No accounts to maintain |
| Hosting | Vercel | Deploys from GitHub on every push |

The database is only ever reached from server code. The connection string never reaches the browser.

## Data model

```
packages 1 ──< package_items            what a package promises (the rules)
    │                 │
    │                 └──────────────┐
    1                                │ package_item_id (nullable)
sponsors 1 ──< deliverables >──── (generated from a rule, or added by hand)
    │               │
    └───────────────┴──< deliverable_events    append-only history
```

- **packages**: a named template, with a `version` that goes up whenever its rules change.
- **package_items**: one rule per thing owed. Each rule has a platform (website, LinkedIn, other), whether it is one-time or repeating, how many, how often, and how many days after the start date the first one is due.
- **sponsors**: contact details, package, status, start and end dates. `sync_signature` records which package version and dates the deliverables were last generated or reviewed against.
- **deliverables**: one row per thing owed. Three separate dates are kept apart on purpose:
  - `due_date`: when the package says it is owed
  - `planned_date`: when you plan to publish (change it freely)
  - `actual_date`: when it really went out (only set when published)
- **deliverable_events**: every generation, schedule change, publish, correction and undo. Rows are only ever added.

Database rules that protect your data:

- A unique index on (sponsor, package rule, sequence number) makes duplicate deliverables impossible, even if you double-click or refresh.
- A deliverable is `published` only if it has an actual date, and the reverse.
- `scheduled` requires a planned date.
- Package rules are archived, never deleted, so history keeps pointing at them.
- Sponsors with published history cannot be deleted. Set them to Inactive instead.
- Row level security is switched on with no policies, so Supabase's public REST API cannot read or write these tables.

## Business rules

**Generating deliverables.** When you add a sponsor with a package, the app creates their deliverables from the package rules in one transaction. A sponsor is never half-created.

- One-time rules create all of their deliverables immediately.
- Repeating rules create the first occurrence plus any due within the next 90 days (`GENERATION_HORIZON_DAYS`). New ones appear automatically as time passes. This is additive only and safe to repeat.
- Due dates count from the sponsor's start date (or the date added if there is no start date).
- Nothing is created past the sponsor's end date, or past a rule's "stop after" count.

**Changing a package.** Editing a package, or moving a sponsor to a different package, changes nothing by itself. The sponsor page shows **Review package changes** with three lists: what will be added, what will be marked Not required, and which package due dates will move. You press Apply when you are ready. Published deliverables are never touched, planned dates are never changed, and deliverables are marked Not required instead of deleted. Sponsors waiting for review are skipped by the automatic top-up, so nothing is half-applied.

**Overdue.** A deliverable is overdue when it is still open (not scheduled, scheduled or in progress) and its planned date, or its package due date if it has no planned date, is before today. Published and Not required are never overdue.

**Published means published.** Only the Publish action sets an actual date. Scheduling never counts as publishing. Publishing the website feature never touches the LinkedIn deliverable, and the reverse. You cannot publish with a future date. A mistaken publish can be undone, and the old date and link stay in the history.

**Who to feature next.** For the website (the LinkedIn queue uses the same engine):

1. A sponsor is eligible if they are Active, not skipped, and have a website deliverable that needs action. That means open, not already scheduled for today or later, and due within 30 days (`RECOMMEND_LOOKAHEAD_DAYS`) or overdue.
2. Eligible sponsors are ranked by, in order:
   1. more outstanding deliverables
   2. has an overdue one
   3. longest time since their last published website feature (never featured counts as longest)
   4. earliest due or planned date
   5. tie-breaks: earlier date added, then name A to Z. The same data always gives the same order, and the app says when a tie-break decided it.
3. Every recommendation lists its reasons in plain words.
4. You stay in control. Schedule anyone from the queue for any date, or press **Skip for now** to move a sponsor out of the queue until next Monday.

## Setup

You need a GitHub account, a Supabase account and a Vercel account. All three have free tiers that cover this app.

### 1. Create the database (Supabase)

1. Create a new project at supabase.com. Save the database password.
2. Open **SQL Editor**, paste the entire contents of `db/migrations/0001_init.sql`, and run it. It is safe to run twice.
3. Open **Project Settings > Database > Connection string**, choose **Transaction pooler**, and copy the string (port 6543). Replace `[YOUR-PASSWORD]` with your password. This is your `DATABASE_URL`.

### 2. Put the code on GitHub

```bash
cd sponsor-tracker
git init
git add .
git commit -m "Sponsor desk"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/sponsor-tracker.git
git push -u origin main
```

`.env.local` is listed in `.gitignore`, so your secrets are not committed.

### 3. Deploy (Vercel)

1. In Vercel choose **Add New > Project** and import the GitHub repository.
2. Before deploying, open **Environment Variables** and add the variables below.
3. Deploy. Every push to `main` redeploys automatically.

### Environment variables

Set these in Vercel under **Project Settings > Environment Variables**. For local development put the same names in a file called `.env.local` (copy `.env.example`).

| Name | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | The Supabase transaction pooler connection string |
| `APP_PASSWORD` | yes | The password you type on the sign-in screen |
| `SESSION_SECRET` | yes | A random string of 32 or more characters that signs the sign-in cookie. Generate one with `openssl rand -base64 48` |
| `APP_TIMEZONE` | no | Defaults to `America/Chicago`. "Today" and "this week" use this time zone |
| `GENERATION_HORIZON_DAYS` | no | How far ahead repeating deliverables are created. Default 90 |
| `RECOMMEND_LOOKAHEAD_DAYS` | no | How far ahead a due date can be and still be recommended now. Default 30 |

Never put these in the code or commit them. If you change one in Vercel, redeploy for it to take effect.

### 4. First run

1. Open your Vercel URL and sign in with `APP_PASSWORD`.
2. Go to **Packages**. Two example packages (Premier Sponsor and Monthly $300 Sponsor) exist only if you ran the seed. **Their rules are placeholders.** Edit them to match your real commitments, or create your own.
3. Go to **Sponsors > Add sponsor**, pick a package, and the deliverables appear.

### Optional: sample data

To try the workflow with fake sponsors, run this from your computer with `DATABASE_URL` set in `.env.local`:

```bash
npm install
npm run db:migrate         # same as pasting the SQL, tracks what has been applied
npm run db:seed            # 2 example packages and 6 sample sponsors with history
npm run db:seed:packages   # just the 2 example packages
```

The seed refuses to add sample sponsors if any sponsors already exist. Sample sponsors have "(sample)" in their name and can be deleted from their sponsor pages. **Do not seed a database that holds real data you have not backed up.**

## Changing packages without touching code

Open **Packages**, then **Edit package**.

- **Add a rule**: pick the platform, one time or repeats, how many, every how many months, first due after how many days, and an optional stop-after count.
- **Edit a rule**: click Edit on any rule.
- **Remove a rule**: Archive it. Past deliverables keep their history.
- **New package**: Packages > New package, then add rules.

Examples:

| You want | Rule |
| --- | --- |
| One website feature at the start | Website, one time, 1, first due after 0 days |
| LinkedIn post on day one | LinkedIn, one time, 1, first due after 0 days |
| Extra LinkedIn feature every other month | LinkedIn, repeats, every 2 months, first due after 60 days |
| A LinkedIn post every month, 12 in total | LinkedIn, repeats, every 1 month, stop after 12 |

After saving, each sponsor on the package shows **Review package changes**.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm run db:migrate
npm run dev                  # http://localhost:3000
```

A local Postgres works as well as Supabase: `postgresql://postgres:postgres@localhost:5432/sponsor_dev`.

### Tests

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sponsor_test
npm test          # 42 tests: rules, recommendations, and the full sponsor workflow against a real database
npm run typecheck
```

The tests wipe the tables of the database in `TEST_DATABASE_URL`. Never point it at real data.

## Assumptions and limits

- **Sample package rules are placeholders.** The app does not invent commitments. Enter your real ones.
- The first feature on LinkedIn is an ordinary one-time LinkedIn rule. "Every other month" is a repeating rule with an interval of 2.
- One website feature per week is a goal, not a lock. The planner will let you schedule more than one.
- LinkedIn is not forced to wait for the website feature, or the reverse.
- One shared password, no user accounts. Failed sign-ins are slowed down but not locked out. Choose a long passphrase.
- Backups: Supabase takes daily backups on paid plans. On the free plan, export the database from time to time (Supabase > Database > Backups, or `pg_dump`).
- Nothing is posted to LinkedIn or the website for you. The app records what you did and where the link is.

## Troubleshooting

| You see | Do this |
| --- | --- |
| "The app is not set up yet" on the sign-in screen | `APP_PASSWORD` or `SESSION_SECRET` is missing, or `SESSION_SECRET` is under 32 characters. Fix it in Vercel and redeploy |
| "Application error" after signing in | `DATABASE_URL` is wrong or the SQL was not run. Check the Vercel function logs |
| Cannot connect from Vercel | Use the **Transaction pooler** string (port 6543), not the direct connection |
| A sponsor shows "Review package changes" | Expected after a package or date change. Review and apply |
| No sponsor is recommended | Everyone's website feature is published, scheduled ahead, not due within 30 days, or skipped |
