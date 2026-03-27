# Suixing Notes App — Project Context

## What is this?

**随行Notes** — A bilingual (Chinese/English) **travel trip planner and checklist app** built with React Native / Expo. Users create trips, manage category-based checklists, track multiple transports and accommodations, notes, and expenses. Includes AI-powered itinerary generation and voice input via Google Gemini.

**App name**: TripTracker (App Store display name; UK first, China later)
**Default language**: English (user can toggle to Chinese; preference persists)

## Tech Stack

- **Expo SDK 54** with **Expo Router 6** (file-based routing)
- **React Native 0.81**, **React 19**, **TypeScript** (strict mode)
- **Ionicons** (`@expo/vector-icons`) for UI icons
- **rn-emoji-keyboard** for trip emoji picker (native-like categories, search, recents)
- **reanimated-color-picker** for custom trip colors (use `onCompleteJS`, not `onComplete`, to avoid crash)
- **react-native-gesture-handler** + **react-native-draggable-flatlist** for category reordering
- **expo-audio** for voice recording (migrated from deprecated `expo-av`)
- **expo-haptics** for tactile feedback (toggle, add, delete, reorder)
- **expo-clipboard** for copy-to-clipboard
- **expo-print** + **expo-sharing** for PDF generation and share
- **expo-file-system/legacy** for base64 file reading
- **@react-native-community/datetimepicker** for native date pickers
- **@react-native-async-storage/async-storage** for local data persistence
- **Gemini 2.5 Flash** via Cloudflare Worker proxy for AI features

## Architecture

### Single-component pattern
The entire app UI lives in **`App.tsx`** (~2300+ lines). All screens are conditionally rendered based on a `screen` state variable. Wrapped in `GestureHandlerRootView` for gesture-based features.

### Screens
- `trips` — Trip list (manual/upcoming sort, empty state with onboarding hints)
- `home` — Trip home (checklists, AI planner, transport/acc/notes/expenses cards)
- `list` — Category checklist view (up/down reorder, inline add, voice input)
- `transport_list` / `acc_list` — List screens for managing multiple transports/accommodations (Back button)
- `edit_flight` / `edit_acc` — Edit forms for individual transport/accommodation items
- `add_trip` / `edit_trip` / `add_category` / `share` / `notes` / `expenses` — Other modals

### Data Model
- **Trip**: `transports?: TransportInfo[]`, `accommodations?: AccommodationInfo[]` (arrays, not single objects)
- **TransportInfo**: `type`, `flightNumber`, `from`, `to`, `departureTime`, `arrivalTime`
- **AccommodationInfo**: `name`, `address`, `checkIn`, `checkOut`
- Categories use colored dots (minimalist); trips use emojis via `rn-emoji-keyboard`

### Data Persistence
- All data stored locally via `AsyncStorage` (no cloud, no accounts)
- Persisted: trips, language preference, sort mode
- Loaded on app start with loading spinner

### Privacy
- **No data collection** — no analytics, no tracking, no telemetry
- **No accounts** — no login, no signup
- **No cloud storage** — everything on-device
- Only network call: Gemini API via proxy (when user explicitly taps AI planner or uses voice)

## Key Features

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
- **Dates optional** — Trips without dates show as "Draft"
- **Delete trip** — With bilingual confirmation alert

### Categories
- **Drag-to-reorder** — "Reorder" button opens modal with `DraggableFlatList`; long-press to drag
- **Colored dots** — No emoji icons; minimalist style
- **Delete confirmation** — Shows item count warning before deletion
- **Item reorder** — 2 arrows (up/down) per item
- **Swipe-to-delete** — Swipe left on checklist items to reveal red delete action (`Swipeable` from gesture-handler)

### Home Cards
- **All cards are fully tappable** — Notes, Expenses, Transport, Accommodation, Trip info
- **No redundant edit icons** — removed pencil/edit icons since cards are tappable

### AI Planner
- **Context** — Feeds transport (from/to, dates) and accommodation details into prompt
- **Structured format** — Day headers, bullet points, Morning/Afternoon/Evening groups
- **Actions** — Share (PDF), Copy, Save to Notes below generated itinerary
- **Save to Notes** — Appends to trip notes; user sees it in Notes card on home

### Haptic Feedback
- **Light tap** — toggle checkbox, reorder items, drag categories
- **Medium tap** — add new item
- **Warning vibration** — delete item, category, or trip

### Trip List
- **Pull-to-refresh** — Pull down on trip list to reload data from AsyncStorage (`RefreshControl`)

### Notes
- **Terminology** — Chinese uses 备忘录 consistently (not 备注)

### Share
- **PDF by default** — Share button generates PDF and opens native share sheet (save to Files, share via any app)
- **shareAsPDF(title, text)** — Uses expo-print + expo-sharing; single flow for trip share and AI itinerary
- Iterates over `transports` and `accommodations` arrays; shows count in checkboxes

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Main app — all screens, state, handlers, styles |
| `services/gemini.ts` | Gemini API (dev direct / prod proxy) |
| `server/gemini-proxy/worker.js` | Cloudflare Worker proxy |
| `server/gemini-proxy/wrangler.toml` | Cloudflare deployment config |
| `server/PROXY-SETUP.md` | Proxy setup guide and useful commands |
| `.env` | `EXPO_PUBLIC_GEMINI_PROXY_URL` (gitignored) |
| `MVP-REVIEW.md` | Pre-launch checklist (14/15 done) |

## Conventions

- **Ionicons** for UI (buttons, headers); **emojis** for trip icons; **colored dots** for categories
- **COLORS** — 7 presets; custom via `reanimated-color-picker`
- **DICT.zh** / **DICT.en** — All user-facing strings
- **Modal overlay** — Include `transport_list` and `acc_list` in the condition so they render
- **Back vs Cancel** — List screens show "Back"; edit forms show "Cancel"
- **Default language** — English (for UK App Store first)

## Environment Setup

```bash
npm install
npx expo start --clear   # Use --clear if env/code changes aren't picked up
```

### Production (proxy mode — what .env currently uses)
```
EXPO_PUBLIC_GEMINI_PROXY_URL=https://suixing-gemini-proxy.suixing-notes.workers.dev
```

### Development (direct mode — optional, faster for testing)
```
EXPO_PUBLIC_GEMINI_API_KEY="your-key-here"
```

## Gemini Proxy

- **Cloudflare Worker**: `https://suixing-gemini-proxy.suixing-notes.workers.dev`
- **Subdomain**: `suixing-notes`
- **API key**: Stored as Cloudflare secret (rotated ✅)
- **Free tier**: 100,000 requests/day
- See `server/PROXY-SETUP.md` for commands and details

## App Store Publishing Status

- **Target stores**: UK App Store first, then China
- **App icon**: Blue checklist design (1024×1024); icon, splash, favicon, Android adaptive assets aligned
- **EAS Build**: `eas build --platform ios` + `eas submit --platform ios --latest`
- **Bundle ID**: `com.suixingnotes.app`
- **iOS `buildNumber`**: Bump in `app.json` for each App Store / TestFlight upload (e.g. `"4"` after build 3)
- **TestFlight**: External beta review passed for earlier builds; iterate with new builds as needed
- **EAS Env**: `EXPO_PUBLIC_GEMINI_PROXY_URL` set for production (plaintext on EAS; `.env` is local only)

## Troubleshooting

- **Gemini quota exceeded** — Free tier has limits; use Google AI Studio to check usage, enable billing, or wait for reset
- **Code/env changes not picked up** — Run `npx expo start --clear` to clear Metro cache
- **Color picker crash** — Must use `onCompleteJS` instead of `onComplete` for reanimated-color-picker
- **Proxy not working** — Check `[Gemini] Calling API... (proxy)` in console; if `(direct)`, proxy URL may not be set in `.env`
