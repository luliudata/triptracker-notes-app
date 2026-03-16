# Suixing Notes App — Project Context

## What is this?

A bilingual (Chinese/English) **travel trip planner and checklist app** built with React Native / Expo. Users create trips, manage category-based checklists, track multiple transports and accommodations, notes, and expenses. Includes AI-powered itinerary generation and voice input via Google Gemini.

## Tech Stack

- **Expo SDK 54** with **Expo Router 6** (file-based routing)
- **React Native 0.81**, **React 19**, **TypeScript** (strict mode)
- **Ionicons** (`@expo/vector-icons`) for UI icons
- **rn-emoji-keyboard** for trip emoji picker (native-like categories, search, recents)
- **reanimated-color-picker** for custom trip colors (use `onCompleteJS`, not `onComplete`, to avoid crash)
- **react-native-gesture-handler** + **react-native-draggable-flatlist** for category reordering
- **expo-audio** for voice recording (migrated from deprecated `expo-av`)
- **expo-clipboard** for copy-to-clipboard
- **expo-file-system/legacy** for base64 file reading
- **@react-native-community/datetimepicker** for native date pickers
- **Gemini 2.5 Flash** via REST API for AI features

## Architecture

### Single-component pattern
The entire app UI lives in **`App.tsx`** (~2000+ lines). All screens are conditionally rendered based on a `screen` state variable. Wrapped in `GestureHandlerRootView` for gesture-based features.

### Screens
- `trips` — Trip list (manual/upcoming sort)
- `home` — Trip home (checklists, AI planner, transport/acc/notes cards)
- `list` — Category checklist view
- `transport_list` / `acc_list` — List screens for managing multiple transports/accommodations (Back button)
- `edit_flight` / `edit_acc` — Edit forms for individual transport/accommodation items
- `add_trip` / `edit_trip` / `add_category` / `share` / `notes` / `expenses` — Other modals

### Data Model
- **Trip**: `transports?: TransportInfo[]`, `accommodations?: AccommodationInfo[]` (arrays, not single objects)
- **TransportInfo**: `type`, `flightNumber`, `from`, `to`, `departureTime`, `arrivalTime`
- **AccommodationInfo**: `name`, `address`, `checkIn`, `checkOut`
- Categories use colored dots (minimalist); trips use emojis via `rn-emoji-keyboard`

## Key Features (Recent Work)

### Transport & Accommodation
- **Multiple items per trip** — Add 2 flights, 4 hotels, etc.
- **Drill-down UX** — Home shows one Transport card and one Accommodation card; tap to open list screen
- **List screens** (`transport_list`, `acc_list`) — View all items, tap to edit, trash to delete, "+ Add" at bottom
- **From/To fields** — Transport has departure and destination for better AI planning

### Trip Creation/Edit
- **Emoji picker** — `rn-emoji-keyboard` opens on tap (no text keyboard); full emoji set
- **Color picker** — Single row of 7 presets + palette icon → custom color modal (hue slider + saturation panel). Use `onCompleteJS` to avoid crash.
- **Date placeholders** — "Pick a date" / "选择日期" (not format hints like YYYY-MM-DD)
- **Date format** — DD/MM/YYYY via `formatDateDisplay()` everywhere

### Categories
- **Drag-to-reorder** — "Reorder" button opens modal with `DraggableFlatList`; long-press to drag
- **Colored dots** — No emoji icons; minimalist style

### AI Planner
- **Context** — Feeds transport (from/to, dates) and accommodation details into prompt
- **Export** — Share, Copy, Save to Notes buttons below generated itinerary
- **Save to Notes** — Appends to trip notes; user sees it in 备忘录 card on home

### Notes
- **Terminology** — Chinese uses 备忘录 consistently (not 备注)

### Share
- Iterates over `transports` and `accommodations` arrays; shows count in checkboxes

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Main app — all screens, state, handlers, styles |
| `services/gemini.ts` | Gemini API (dev direct / prod proxy) |
| `server/gemini-proxy-worker.js` | Cloudflare Worker for prod |
| `.env` | `EXPO_PUBLIC_GEMINI_API_KEY` (gitignored) |

## Conventions

- **Ionicons** for UI (buttons, headers); **emojis** for trip icons; **colored dots** for categories
- **COLORS** — 7 presets; custom via `reanimated-color-picker`
- **DICT.zh** / **DICT.en** — All user-facing strings
- **Modal overlay** — Include `transport_list` and `acc_list` in the condition so they render
- **Back vs Cancel** — List screens show "Back"; edit forms show "Cancel"

## Environment Setup

```bash
npm install
echo 'EXPO_PUBLIC_GEMINI_API_KEY=your_key_here' > .env
npx expo start --clear   # Use --clear if env/code changes aren't picked up
```

Get a Gemini API key at https://aistudio.google.com/apikey
