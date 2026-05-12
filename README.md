# Fitnesstracker

Adaptive calorie tracker for a 71-day cut: **102 kg → 90 kg** (May 12 – Jul 22, 2026).

## Features

- **Mifflin-St Jeor** BMR calculation, recalculating as weight drops
- **3 phases**: Kickstart (days 1–14), Steady Cut (15–45), Final Push (46–71)
- **Sport/Rest day toggle** with different TDEE calculations
- **Auto-readjustment**: cumulative calorie tracking shifts future deficits
- **Macro breakdown**: Protein 150g / Fat 55g / Carbs fill remaining
- **Weight chart** (canvas-based trend visualization)
- **Weekly summaries** with average deficit and weight
- **Export/Import** data as JSON
- **PWA manifest** for home screen installation
- **Confetti** when weigh-in shows you're ahead of schedule
- **localStorage** persistence (no backend needed)
- **Dark theme**, mobile-first design

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
npm start
```

## Deploy to Vercel

```bash
npx vercel
```

Or push to GitHub and connect the repo in the Vercel dashboard.

## Tech Stack

- Next.js 15 (App Router, standalone output)
- React 19, TypeScript (strict)
- No external UI libraries — pure React with inline styles
- IBM Plex Sans + JetBrains Mono (Google Fonts)
