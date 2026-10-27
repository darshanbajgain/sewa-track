# Frontend Architecture (`apps/web`)

> **Demo / portfolio project. Not affiliated with any government body. All data is fake.**

How the web app is built, where everything lives, how data flows, and the rules for design,
accessibility, security and routing, including the plan for the citizen and staff portals.

- System design: [architecture.md](./architecture.md) · API: [api.md](./api.md) (live: `/api/docs`) · Code map: [codebase-guide.md](./codebase-guide.md)
- Status markers: ✅ built · 🔜 planned

## Contents
1. [Stack](#1-stack)
2. [Folder structure](#2-folder-structure)
3. [How a page gets its data](#3-how-a-page-gets-its-data)
4. [Design system](#4-design-system)
5. [Component library (`components/common`)](#5-component-library-componentscommon)
6. [Accessibility](#6-accessibility)
7. [Routing and portals](#7-routing-and-portals)
8. [Security](#8-security)
9. [Internationalisation](#9-internationalisation)
10. [Recipes](#10-recipes)
11. [Testing and verification](#11-testing-and-verification)
12. [Decisions and trade-offs](#12-decisions-and-trade-offs)

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router) | File-based routes, layouts per portal, production build + pre-rendering |
| UI | **React 19** | `useEffectEvent`, `useId` used in common components |
| Styling | **Tailwind CSS 4** | Design tokens in CSS (`@theme`), no separate CSS files per component |
| Server state | **TanStack Query 5** | Caching, loading/error states, de-duplication, invalidation after changes |
| HTTP | **axios** | One instance with interceptors (errors, 401), timeout, cookies |
| Map | **Leaflet** 🔜 | Used directly (no wrapper); boundary file must follow Nepal's official 2020 map |
| Fonts | Noto Sans + Noto Sans Devanagari via `next/font` | Self-hosted at build time; proper Nepali rendering |

Rejected: `react-leaflet` (Hippocratic-2.1 license, not standard open source), `leaflet.heat`
(unmaintained since 2015, no license).

---

## 2. Folder structure

```
apps/web/
├─ next.config.ts            /api/* → Express API (same origin); security headers
├─ messages/
│  ├─ en.json                every UI label in English
│  └─ ne.json                every UI label in Nepali (TypeScript fails if a key is missing)
└─ src/
   ├─ proxy.ts               Next 16 "proxy" (ex-middleware): no session cookie → /login (portals only)
   ├─ app/                   ROUTES (one folder = one URL)
   │  ├─ layout.tsx          banner → header → nav → page → footer; fonts; Providers
   │  ├─ providers.tsx       QueryClient · LanguageProvider · SessionWatcher
   │  ├─ globals.css         design tokens (@theme), focus outline
   │  ├─ icon.svg            our own "ST" mark
   │  ├─ page.tsx            /          home ✅
   │  ├─ services/           /services  catalog ✅
   │  ├─ track/              /track     public tracking ✅
   │  ├─ login/              /login     demo accounts + phone form ✅
   │  ├─ citizen/            /citizen/* citizen portal ✅ (layout = RequireRole + portal tabs)
   │  │  ├─ page.tsx         my requests
   │  │  ├─ apply/page.tsx   apply (cascading dropdowns, shared Zod validation, tracking code)
   │  │  └─ requests/[id]/   detail: history, resubmit (note), cancel (confirm modal), 409 handling
   │  └─ staff/              /staff/*   staff portal 🔜 (layout wraps <RequireRole roles={staff}>)
   ├─ api/                   HTTP ONLY (no React)
   │  ├─ client.ts           axios instance + interceptor → ApiError; 401 hook
   │  ├─ endpoints.ts        ENDPOINTS: every API path in one place
   │  └─ *.api.ts            auth · reference · requests · tracking · stats (one function per endpoint)
   ├─ hooks/                 REACT + TANSTACK QUERY (pages use only these)
   │  ├─ queryKeys.ts        every cache key from one factory
   │  └─ use*.ts             useAuth · useReference · useRequests · useTracking · useStats
   ├─ components/
   │  ├─ common/             reusable UI: Button, ButtonLink, Card, PageTitle, Badge, Alert, Modal,
   │  │                      TextField, TextAreaField, SelectField, QueryState, Spinner (+ index.ts)
   │  ├─ auth/               SessionWatcher (401 → login), RequireRole (portal guard)
   │  └─ SiteChrome.tsx      DemoBanner, SiteHeader, SiteFooter
   └─ lib/
      ├─ i18n.tsx            useI18n(): t(key), language toggle, pickName()
      └─ routing.ts          ROLE_HOME, PORTAL_ROLES, safeNextPath(), loginUrl()
```

**Where does new code go?**

| You're adding… | Put it in |
|---|---|
| a new page / URL | `src/app/<route>/page.tsx` |
| a call to a new API endpoint | path in `api/endpoints.ts` → function in `api/<module>.api.ts` |
| data for a page | a hook in `hooks/use<Module>.ts` (+ key in `queryKeys.ts`) |
| a visual element used twice or more | `components/common/` (export from `index.ts`) |
| a label the user reads | both `messages/en.json` and `messages/ne.json` |

---

## 3. How a page gets its data

```
 page (app/…/page.tsx)
   │  const detail = useRequestDetail(id)
   ▼
 hook (hooks/useRequests.ts)          TanStack Query: cache, loading, error, refetch
   │  queryFn: () => getRequestDetail(id)
   ▼
 API function (api/requests.api.ts)   plain async function, typed with @sewa/shared DTOs
   │  client.get(ENDPOINTS.requests.detail(id))
   ▼
 axios client (api/client.ts)         baseURL /api/v1 · cookies · 15 s timeout · interceptor → ApiError
   │
   ▼
 Next.js rewrite (next.config.ts)     /api/* → http://API_ORIGIN/api/*   (same origin for the browser)
   │
   ▼
 Express API                          validates, authorizes, runs SQL (see architecture.md)
```

**Reads** use `useQuery`. Useful options: `enabled` (cascading dropdowns load only after the parent is
chosen), `placeholderData` (keep the old page visible while the next one loads), `staleTime`.

**Writes** use `useMutation`. On success they **invalidate** query keys so screens refetch by themselves:

| Mutation | Invalidates | Why |
|---|---|---|
| `useSubmitRequest` | `['requests']`, `['stats']` | My requests and the numbers change |
| `useChangeStatus`, `useMarkFeePaid` | same, **also on error** | a 409 means our copy is stale, so refetch either way |
| `useLogin`, `useLogout` | **everything** (`queryClient.clear()`) | never show one user's cached data to the next |

**Query keys** go from general to specific (`['requests', 'detail', id]`), so invalidating `['requests']`
refreshes the queue, my requests and every detail at once.

**Errors:** the axios interceptor turns every failure into `ApiError(status, code, message, requestId)`.
Pages switch on `code` (e.g. `CONFLICT` → "updated by someone else, reload"); `QueryState` shows a
dedicated message for 403.

---

## 4. Design system

A familiar **government-portal pattern** in our own design: thin strip → white header with bilingual
name → blue navigation → hero → cards → dark footer.

| Token (`globals.css`) | Value | Use |
|---|---|---|
| `primary` | `#003893` Nepal blue | nav bar, primary buttons, headings, links |
| `primary-dark` / `primary-soft` | `#002766` / `#e8eef9` | hover, footer / light backgrounds |
| `accent` | `#dc143c` crimson | **sparingly**: top line, active-nav underline, Log in, overdue, focus outline |
| `ink` / `muted` | `#1b1f24` / `#4b5563` | body / secondary text (both ≥ 4.5:1 on white) |
| `line` / `surface` | `#d8dee8` / `#f4f6fa` | borders / section backgrounds |
| `ok`, `warn` (+ `-soft`) | green / amber | on time, demo values |
| `demo` / `demo-ink` | amber | the demo banner (deliberately not blue or crimson) |

**Hard rules (AGENTS §3):** no national emblem, flag shape, palika logo or "Government of Nepal /
नेपाल सरकार" wording; nothing copied from any real government site; the bilingual demo banner is the first
thing on every page; fees and days are labelled as demo values; `robots: noindex`.

**Variant rule:** never override a component's colours with `className` (Tailwind can't guarantee which
class wins). Add a variant instead (that's how `accent` was added to Button).

---

## 5. Component library (`components/common`)

| Component | Props / variants | Notes |
|---|---|---|
| `Button` | `variant`: primary · accent · secondary · danger · ghost · `size`: md (44 px) · lg (48 px) · `loading` | `type="button"` by default (never submits a form by accident); `loading` → disabled + spinner + `aria-busy` |
| `ButtonLink` | same look | a real `<a>` (Next `Link`): announced as a link, works with middle-click |
| `Card` | `as`: div · article · section | |
| `PageTitle` | `title`, `intro` | the page's single `<h1>` |
| `Badge` | `tone`: info · success · warning · danger · neutral | text always states the meaning (not colour alone) |
| `Alert` | `tone`: error · success · info · warning · `action` | error → `role="alert"`, others → `role="status"` |
| `TextField`, `TextAreaField`, `SelectField` | `label`, `hint`, `error` + native props | visible label; `aria-describedby` (hint, error); `aria-invalid`; ids from `useId()` |
| `Modal` | `open`, `onClose`, `title`, `description`, `footer`, `closeLabel` | see below |
| `QueryState` | `isLoading`, `error`, `onRetry` | spinner / retry / 403 message |
| `Spinner` | `className` | decorative (`aria-hidden`) |
| `CheckboxField` | `label`, `error` + native props | whole label clickable; error linked |
| `StatusBadge`, `OverdueBadge` (`components/requests`) | `status` / `overdue` | one colour per status, label always written |

### Modal behaviour (WAI-ARIA "dialog (modal)" pattern)
- Rendered with **`createPortal` into `<body>`**: no parent `overflow` or stacking order can clip it.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title, `aria-describedby` → description.
- **Focus** moves into the dialog on open, is **trapped** (Tab / Shift+Tab wrap inside), and **returns to
  the opener** on close.
- **Esc** closes; a **backdrop** click closes; a click **inside** does not.
- Page **scroll is locked** while open.
- `useEffectEvent` calls the latest `onClose` without re-running the effect (otherwise focus would jump on
  every parent re-render).
- Verified in Chrome: see §11.

---

## 6. Accessibility

Target: WCAG 2.1 AA basics, keyboard first.

| Rule | How |
|---|---|
| Everything works with the keyboard | real `<button>` / `<a>` / form controls only; no clickable `<div>` |
| Focus is always visible | global `:focus-visible` crimson 3 px outline |
| Skip the menu | "Skip to content" link → `<main id="main">` |
| Inputs have labels | `TextField`/`SelectField` render a `<label for>`; hints and errors via `aria-describedby` |
| Errors are announced | `Alert tone="error"` → `role="alert"`; loading → `role="status"` |
| Current page in the menu | `aria-current="page"` on the active nav link |
| Touch targets | buttons and links ≥ 44 px high |
| Colour contrast | text tokens ≥ 4.5:1 on white; status also written in words |
| Language | `<html lang>` follows the toggle; mixed text marked with `lang="ne"` |
| Small screens | layouts wrap; wide tables scroll inside their own box; no page-level sideways scroll at 375 px |
| Dialogs | §5 Modal behaviour |

---

## 7. Routing and portals

One app, three portals (decided 2026-10-26):

| Portal | Routes | Who |
|---|---|---|
| Public ✅ | `/`, `/services`, `/track`, `/login` | anyone |
| Citizen ✅ | `/citizen` (my requests), `/citizen/apply`, `/citizen/requests/[id]` | `CITIZEN` |
| Staff 🔜 | `/staff` (queue), `/staff/requests/[id]`, `/staff/reports`, `/staff/map` | `WARD_OFFICER`, `PALIKA_ADMIN`, `SYSTEM_ADMIN` |

### Three layers of protection for a portal page
```
 1. proxy.ts (server, before render)   no sewa_session cookie?  → 307 /login?next=…&reason=required
                                       (optimistic: checks the cookie EXISTS, can't verify it: no secret)
 2. RequireRole (client, portal layout) GET /auth/me → nobody: go to login · wrong role: "no access" (403 UI)
 3. The API (the real security)         every endpoint checks session, role AND scope; returns 401/403
```
Layers 1–2 are for a smooth experience; **layer 3 is the only one that protects data.** Hiding a button or
a page in the browser is never security.

### After login
`ROLE_HOME` in `lib/routing.ts` decides where each role lands: citizen → `/citizen` ✅; staff roles → `/` until
the staff portal exists (then officers and palika admins → `/staff`, system admin → `/staff/map`).

**After login we do a full page load** (`window.location.assign`), not `router.push`: while logged out, Next.js
may have pre-fetched the target and cached proxy.ts's "redirect to login" answer, so a client-side push would
bounce back to login (found in end-to-end testing). A fresh load also resets all client state for the new user. If the user was sent to login
from a page, `?next=` brings them back, but only to **our own paths** (`safeNextPath`, see §8).

### Portal layout (planned shape)
```tsx
// app/staff/layout.tsx
export default function StaffLayout({ children }) {
  return <RequireRole roles={PORTAL_ROLES.staff}><StaffNav />{children}</RequireRole>;
}
```
Navigation per portal: citizen → My requests · Apply · Track; staff → Queue · Map · Reports (Reports and
Map shown to admins; the officer sees the queue and their ward).

---

## 8. Security

### Session model (frontend + backend)
| Concern | Backend | Frontend |
|---|---|---|
| Where is the token? | JWT (HS256, 8 h) in an **httpOnly**, `SameSite=Lax` (+ `Secure` in production) cookie | never stored or read by JS (no localStorage) |
| Who am I? | `GET /auth/me` | `useMe()`; `null` = logged out |
| Expired / tampered token | `requireAuth` → **401** and **clears the cookie** | axios interceptor → `SessionWatcher`: clear cache → `/login?reason=expired&next=…` |
| Wrong role / scope | **403** (role middleware + scope rules in services) | `RequireRole` shows "no access"; `QueryState` shows a 403 message |
| Log out | `POST /auth/logout` clears the cookie | `queryClient.clear()` → home |
| Brute force | login 5/min/IP, tracking 10/min/IP → 429 | friendly "wait a minute" messages |
| CSRF | `SameSite=Lax` cookie + JSON-only API (no form posts) | same-origin requests only |

**Known trade-off:** a stateless JWT stays valid until it expires even after logout if someone copied it.
Mitigations: httpOnly (JS can't copy it), 8 h lifetime. Production option: short tokens + refresh, or a
server-side session list.

### Frontend-specific controls
| Threat | Control |
|---|---|
| **Open redirect** (`/login?next=https://evil…`) | `safeNextPath()` accepts only `/path`, rejects `//host` and `\` tricks (tested in Chrome) |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Leaking URLs to other sites | `Referrer-Policy: strict-origin-when-cross-origin` |
| Unneeded browser features | `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| XSS | React escapes all text; no `dangerouslySetInnerHTML`; the token is httpOnly anyway |
| Server fingerprinting | `poweredByHeader: false` |
| Search engines indexing a fake "service" | `robots: noindex` |
| Secrets in the browser | none: the web app never holds the JWT secret or any API key |

**Not yet:** a full Content-Security-Policy for Next.js pages needs a per-request nonce (Next.js supports
it via `proxy.ts`); planned for the deploy phase. The API already sends a strict CSP (helmet).

---

## 9. Internationalisation
- `t('key')` from `useI18n()`; keys in `messages/en.json` + `ne.json`. The Nepali file is type-checked against
  the English one: a missing key fails the build.
- API data is bilingual: `pickName(item, lang)` picks `nameEn` / `nameNe`.
- Numbers in Nepali digits: `n.toLocaleString('ne-NP-u-nu-deva')`; dates in `Asia/Kathmandu`.
- Choice saved in `localStorage` (wrapped in try/catch). The server always renders English; the saved
  choice applies right after load.
- 🔜 BS (Bikram Sambat) dates next to AD dates in the portals.

---

## 10. Recipes

**Add an API call + hook**
1. `api/endpoints.ts`: add the path.
2. `api/<module>.api.ts`: `export async function getX(…) { const { data } = await client.get<…>(ENDPOINTS…); return data… }`
3. `hooks/queryKeys.ts`: add a key; `hooks/use<Module>.ts`: `useQuery` / `useMutation` (+ `invalidateQueries` for writes).
4. Use the hook in the page; show `QueryState` for loading/error.

**Add a page:** `src/app/<route>/page.tsx` with `'use client'` if it uses hooks, one `PageTitle` (the `<h1>`),
labels via `t()`, and only `components/common` building blocks. Don't link to it until it exists: Next.js
pre-fetches links in production (see §11).

**Add a portal page:** put it under `app/citizen/` or `app/staff/`; the portal layout's `RequireRole` and
`proxy.ts` cover it automatically.

---

## 11. Testing and verification
- `pnpm --filter @sewa/web typecheck` (Next route types + `tsc`), `pnpm --filter @sewa/web build` (production build).
- Checked in a real Chrome against the **production build** (headless):
  - every page in English and Nepali: no hydration errors; no sideways scroll at 375 px
  - tracking: messy code accepted; invalid code message; login → name in header → log out; cookie unreadable by JS
  - Modal: portal into `<body>`, `aria-modal`, focus in on open, Tab/Shift+Tab trapped, Esc closes, focus
    returns to opener, scroll lock, inside click keeps open, backdrop click closes
  - open redirect: `?next=//evil.example/steal` → lands on `/`; `?next=/services` honoured
  - `proxy.ts`: `/citizen` and `/staff/queue` without a session → 307 to `/login?next=…&reason=required`
  - security headers present on every page
- **Lesson learned:** test the production build. Next.js pre-fetches every link in production; a link to
  a not-yet-existing page made page loads hang, which dev mode didn't show.
- Citizen journey end to end (production build, Chrome): Apply while logged out → login → back on the form;
  empty submit marks 6 invalid fields; cascading dropdowns; documents panel; tracking code; a second officer
  changes the request meanwhile → **409 message + automatic refetch**; officer note shown; empty resubmit note
  blocked; resubmit; Cancel hidden once under review; listed in My requests; an officer opening /citizen → no access;
  Nepali at 375 px without sideways scroll.
- 🔜 Component tests (Vitest + React Testing Library) and one Playwright end-to-end flow (PRD §13).

---

## 12. Decisions and trade-offs
| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Talking to the API | same-origin `/api` rewrite | CORS + cross-site cookie | `SameSite=Lax` httpOnly cookie just works |
| HTTP client | axios | fetch | interceptors (errors, 401), timeout, familiar to most teams |
| Server state | TanStack Query | Redux / useEffect + useState | caching + invalidation built in; no global store needed |
| i18n | small typed dictionary | next-intl / i18next | two languages, a few dozen labels; no dependency |
| Map | plain Leaflet | react-leaflet | license; one small component is enough |
| Route protection | proxy + RequireRole + API | client-only checks | layered; the API is the real guard |
| Portals | one app, three areas | separate staff app | shared components, one deploy, one cookie |
