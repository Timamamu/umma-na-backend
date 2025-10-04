# UMMA NA Backend
## H2 Overview
UMMA NA Backend is an Express-based API that orchestrates emergency maternal transport workflows. It authenticates CHIPS agents and ETS drivers, manages catchment areas and hospital metadata, stores ride assignments in Firestore, and coordinates drivers through Firebase Cloud Messaging notifications.

## H2 Tech Stack
Runtime: Node.js (CommonJS modules)
Core dependencies: Express for HTTP routing, Firebase Admin SDK for Firestore access and push notifications, CORS middleware, dotenv for environment configuration, and Expo Server SDK (installed for push support).

## H2 Getting Started

### H3 Prerequisites
Node.js 18+ (recommended for Firebase Admin SDK compatibility)
A Firebase project with a service-account credential that has Firestore and FCM access

### H3 Installation
1. Clone the repository and install dependencies:
   `npm install`
2. (Optional) Remove unused packages if you are not leveraging Expo push notifications.

### H3 Environment Variables
Create a .env file with the Firebase service-account credentials and optional port override:
`FIREBASE_PROJECT_ID=your-project-id`
`FIREBASE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com`
`FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
`PORT=3001`
FIREBASE_PRIVATE_KEY should preserve newline characters (escaped as \n).

## H2 Running the Server

Start the API with:
`node index.js`
The server listens on PORT (default 3001) and logs readiness to the console.

## H2 Firebase Setup
The API initializes Firebase Admin with a certificate constructed from environment variables and uses Firestore as its persistence layer. Ensure the service account has appropriate roles for Firestore and Cloud Messaging.

## H3 Expected Collections
catchmentAreas
chipsAgents
etsDrivers
hospitals
rideRequests
Each endpoint assumes these collections exist and enforces referential integrity before destructive operations

## H2 API Overview

### H3 Authentication
POST /auth/login — Validates a CHIPS agent or ETS driver by phone number and username, returning a placeholder dev token.

### H3 Catchment Areas
POST /register-catchment-area — Creates a catchment area after duplicate checks on name/ward/LGA.
GET /catchment-areas — Lists all catchment areas.
PUT /catchment-areas/:id — Updates metadata with duplicate protection.
DELETE /catchment-areas/:id — Prevents removal when linked to agents or drivers.

### H3 CHIPS Agents
POST /register-chips — Registers a CHIPS agent, auto-generating a username and validating phone format.
GET /chips-agents — Lists agents.
PATCH /update-chips-agent/:id — Partially updates agent details.
DELETE /chips-agents/:id — Blocks deletion if active ride requests reference the agent.

### H3 ETS Drivers
POST /register-ets-driver — Registers a driver, deriving a fallback location from assigned catchment areas.
GET /ets-drivers — Lists drivers.
PATCH /update-ets-driver/:id — Partially updates driver metadata.
POST /update-driver-location — Stores live location updates, differentiating significant changes and retaining history.
POST /request-driver-location — Requests an immediate location refresh via FCM push, flagging the driver document for follow-up.
DELETE /ets-drivers/:id — Prevents deletion while the driver is attached to active rides.

### H3 Hospitals
POST /register-hospital — Adds a facility with capability flags, guarding against duplicates by name/ward/LGA and proximity.
GET /hospitals — Lists hospitals.
PATCH /update-hospital/:id — Updates facility info.
DELETE /hospitals/:id — Blocks removal when active ride requests target the hospital.

### H3 Ride Tracking & History
PATCH /update-request/:id — Generic ride request updates.
GET /chips-active-ride/:id — Retrieves the latest active ride for a CHIPS agent.
GET /driver-active-ride/:id — Returns an active ride for a driver, including CHIPS contact info when available.
GET /chips-ride-history/:id — Lists ride history for a CHIPS agent with normalized timestamps.
GET /driver-ride-history/:id — Lists and enriches driver rides, sorting by creation time and embedding agent details.
GET /driver-pending-requests/:id — Shows the most recent pending ride requests (currently unfiltered by geography).

### H3 Ride Requests & Notifications
POST /request-ride — Core workflow: maps symptoms to emergency conditions, filters available drivers, requests fresh locations, selects a hospital based on capabilities and travel time, persists the ride, and notifies candidate drivers through FCM.
POST /respond-to-ride-request — Records driver accept/decline decisions, updates ride state, manages overrides, and notifies the CHIPS agent on acceptance.

### H3 Emergency Triage Logic
Condition definitions, capability requirements, and vehicle rules live in constants/EMERGENCY_CONDITIONS.js. The /request-ride handler consumes these utilities (identifyCondition, CAPABILITY_REQUIREMENTS, VEHICLE_REQUIREMENTS) to map reported symptoms to care pathways and transport strategies.
An additional heuristic scorer exists in utils/conditionIdentifier.js; it expects a constants/SYMPTOMS dataset and can be adapted for alternative triage logic if supplied with the appropriate mappings.

### H3 Development Notes
There is no default start script; run the server with node index.js or add a script to package.json.
Automated tests are not configured (npm test exits immediately).


