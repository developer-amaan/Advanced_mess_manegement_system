# Shivalik Mess Meter

Shivalik Mess Meter is a locally runnable college mess management app. It uses React, Vite, Express, and a JSON file database; no external services or accounts are required. Use Node.js 20 or newer.

## Run locally

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Express API runs on port 4000. The database is initialized and seeded automatically at `server/data/db.json`.

## Install the demo on this computer

On Windows, extract the project ZIP and double-click `Start Shivalik Mess Meter.bat`. On first run it installs npm packages, builds the installable PWA, and starts the app and local API; keep its terminal window open. Open `http://localhost:5173` in Chrome or Edge, then choose the browser's **Install Shivalik Mess Meter** control or **Install app** menu item. The installable demo runs on this computer while its local API is running, and its database persists in `server/data/db.json`.

This produces a browser-installed PWA, not a native Android APK. This computer does not have Java or the Android SDK to compile an APK. Installing the PWA on phones for use away from this computer would require hosting the web app and API at a secure HTTPS address; the local demo ZIP alone does not make it remotely accessible. API data is not available while the local app server is stopped.

For an in-person phone demo on the same private Wi-Fi, open the desktop computer's network address on the phone at port `5173`; the phone and computer must stay on the same trusted network. The API permits localhost and private-LAN browser origins. The phone browser can display the student QR pass while the staff scanner runs on the desktop at `localhost`, where camera permission is available. This LAN preview is not an internet deployment and does not install a native Android app.

## Temporary HTTPS phone demo

The app uses a same-origin `/api` path and Vite proxy so the installable PWA, API login, and manager camera scanner work together over HTTPS. To expose a local preview temporarily without an account, build the app and run the API and preview, then use the official Cloudflare `cloudflared tunnel --url http://localhost:<preview-port>` Quick Tunnel. Use a separate, empty demo database (`MESSMETER_DB_PATH`) rather than exposing a database with personal data. The generated public link is temporary, can change when the tunnel restarts, and is reachable by anyone who has it while both local processes are running. Stop the tunnel and both servers when the demo is finished. Quick Tunnels have no uptime guarantee and are for testing, not production hosting.

## Demo accounts

- Student: `student@messmeter.local` / `student123`
- Manager: `Diablo` (`manager@messmeter.local` / `manager123`)

Passwords are hashed with bcrypt. For a shared deployment, copy `.env.example` to `.env` and set a private `JWT_SECRET`. Add the deployment URL(s) to `ALLOWED_ORIGINS` and set `VITE_API_URL` to the public API origin when the frontend and API are served from different domains. The local default is only intended for development.

## Meal selection and QR check-in

Meal decisions are enforced by the API in India Standard Time:

- Breakfast: choose or cancel through 11:59 PM on the previous date.
- Lunch: 6:00–10:00 AM on the meal date.
- Snacks: 1:00–2:30 PM on the meal date.
- Dinner: 3:00–4:30 PM on the meal date.

Students receive a private, single-use QR pass as soon as they confirm a meal. Check-in is accepted from 15 minutes before the scheduled serving time until 90 minutes after it. A manager/staff member signs into the attendance screen and scans the pass with the camera (or enters a scanned token); a successful scan records the student check-in. Check-ins count people, while the manager separately enters the number of plates actually served; the app uses that plate count to estimate unused portions. The server rejects reused and expired passes. Camera access requires a secure browser context such as localhost or HTTPS.

The student dashboard shows in-app reminders when an RSVP deadline is within two hours or a serving begins within one hour. The manager dashboard calls out servings in the next hour and provides a prep target of `ceil(expected RSVPs × 1.05)`. The target is a simple 5% planning buffer, not a prediction guarantee.

Managers can mark specific menu items unavailable; students see the changed items on their meal cards. Food rescue offers can be tracked through awaiting response, accepted, picked up, or expired, including the number of portions collected. Partner contact is still manual: composing a message opens an email draft and does not send it automatically.

## Food rescue and compost workflows

- **Food rescue:** Managers can save nearby NGO/community-group contacts with their approximate distance from the mess, list a measured number of safe surplus portions, set a pickup location and deadline, and choose who should receive the offer. Offers track partner response and pickup totals. The offer is saved locally; its email link opens a draft for the manager to review and send. This local-only app does not send email automatically or determine location/distance by GPS.
- **Compost and Shivalik Farm:** Managers record stale-food input, measured compost output, processing and ready dates, and production costs. Matured inventory can then be recorded as applied on Shivalik Farm or sold, with sale proceeds and estimated margin tracked locally. These are records for a prototype—not marketplace listings, verified sales, or payment processing.
