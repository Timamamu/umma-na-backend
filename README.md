![UMMA Logo](assets/ummana.png)

# UMMA NA Backend

A Node.js/Express API that orchestrates emergency maternal transport workflows for the UMMA NA community health platform. The backend authenticates CHIPS agents and ETS drivers, manages catchment areas and hospital metadata, stores ride assignments in Firestore, and coordinates drivers through Firebase Cloud Messaging notifications.

## Overview

UMMA NA Backend handles the critical server-side operations for maternal health emergency response, including symptom-to-condition mapping, intelligent driver selection, hospital capability matching, and real-time communication between CHIPS agents and ETS drivers.

## Tech Stack

- **Runtime**: Node.js (CommonJS modules)
- **Framework**: Express.js for HTTP routing
- **Database**: Firebase Firestore
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Additional**: CORS middleware, dotenv for environment configuration, Expo Server SDK for push notifications

## Prerequisites

- **Node.js**: Version 18+ (recommended for Firebase Admin SDK compatibility)
- **Firebase Project**: A Firebase project with a service account credential that has Firestore and FCM access
- **npm**: Version 6.0 or higher

## Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd umma-na-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** (see next section)

### Environment Variables

Create a `.env` file in the root directory with your Firebase service account credentials:

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
PORT=3001
```

**Important**: Keep your `.env` file secure and never commit it to version control.

### Firebase Setup

The API initializes Firebase Admin with a certificate constructed from environment variables and uses Firestore as its persistence layer. Ensure your service account has the following roles:

- **Cloud Datastore User** (for Firestore access)
- **Firebase Cloud Messaging Admin** (for push notifications)

### Expected Firestore Collections

The backend expects these collections to exist in your Firestore database:

- `catchmentAreas` - Geographic service areas
- `chipsAgents` - Community health workers
- `etsDrivers` - Emergency transport drivers
- `hospitals` - Healthcare facilities with capability metadata
- `rideRequests` - Transport requests and ride history

Each endpoint enforces referential integrity before destructive operations.

## Running the Server

Start the API with:

```bash
node index.js
```

The server listens on the `PORT` environment variable (default: 3001) and logs readiness to the console:

```
Server is live on port 3001
```

To verify the server is running, visit `http://localhost:3001` in your browser. You should see:
```
UMMA NA Backend is running!
```

## API Documentation

### Authentication

**POST** `/auth/login`  
Validates a CHIPS agent or ETS driver by phone number and username, returning a development token.

**Request Body:**
```json
{
  "phoneNumber": "0801234567",
  "username": "john_doe",
  "role": "chips"
}
```

### Catchment Areas

**POST** `/register-catchment-area`  
Creates a catchment area after duplicate checks on name/ward/LGA.

**GET** `/catchment-areas`  
Lists all catchment areas.

**PUT** `/catchment-areas/:id`  
Updates metadata with duplicate protection.

**DELETE** `/catchment-areas/:id`  
Prevents removal when linked to agents or drivers.

### CHIPS Agents

**POST** `/register-chips`  
Registers a CHIPS agent, auto-generating a username and validating phone format.

**GET** `/chips-agents`  
Lists all agents.

**PATCH** `/update-chips-agent/:id`  
Partially updates agent details.

**DELETE** `/chips-agents/:id`  
Blocks deletion if active ride requests reference the agent.

### ETS Drivers

**POST** `/register-ets-driver`  
Registers a driver, deriving a fallback location from assigned catchment areas.

**GET** `/ets-drivers`  
Lists all drivers.

**PATCH** `/update-ets-driver/:id`  
Partially updates driver metadata.

**POST** `/update-driver-location`  
Stores live location updates, differentiating significant changes and retaining history.

**POST** `/request-driver-location`  
Requests an immediate location refresh via FCM push, flagging the driver document for follow-up.

**DELETE** `/ets-drivers/:id`  
Prevents deletion while the driver is attached to active rides.

### Hospitals

**POST** `/register-hospital`  
Adds a facility with capability flags, guarding against duplicates by name/ward/LGA and proximity.

**GET** `/hospitals`  
Lists all hospitals.

**PATCH** `/update-hospital/:id`  
Updates facility information.

**DELETE** `/hospitals/:id`  
Blocks removal when active ride requests target the hospital.

### Ride Tracking & History

**PATCH** `/update-request/:id`  
Generic ride request updates.

**GET** `/chips-active-ride/:id`  
Retrieves the latest active ride for a CHIPS agent.

**GET** `/driver-active-ride/:id`  
Returns an active ride for a driver, including CHIPS contact info when available.

**GET** `/chips-ride-history/:id`  
Lists ride history for a CHIPS agent with normalized timestamps.

**GET** `/driver-ride-history/:id`  
Lists and enriches driver rides, sorting by creation time and embedding agent details.

**GET** `/driver-pending-requests/:id`  
Shows the most recent pending ride requests for a driver.

### Ride Requests & Notifications

**POST** `/request-ride`  
Core workflow that maps symptoms to emergency conditions, filters available drivers, requests fresh locations, selects a hospital based on capabilities and travel time, persists the ride, and notifies candidate drivers through FCM.

**Request Body:**
```json
{
  "chipsAgentId": "agent123",
  "symptoms": ["heavy_bleeding", "dizziness"],
  "pickupLat": 8.4822,
  "pickupLng": -11.7790
}
```

**POST** `/respond-to-ride-request`  
Records driver accept/decline decisions, updates ride state, manages overrides, and notifies the CHIPS agent on acceptance.

**Request Body:**
```json
{
  "driverId": "driver456",
  "rideId": "ride789",
  "response": "accept"
}
```

## Emergency Triage Logic

Condition definitions, capability requirements, and vehicle rules are defined in `constants/EMERGENCY_CONDITIONS.js`. 

The `/request-ride` handler consumes these utilities to map reported symptoms to care pathways and transport strategies:

- `identifyCondition()` - Maps symptom arrays to emergency condition types
- `CAPABILITY_REQUIREMENTS` - Defines ideal and acceptable hospital capabilities per condition
- `VEHICLE_REQUIREMENTS` - Specifies allowed and preferred vehicle types per condition

An additional heuristic scorer exists in `utils/conditionIdentifier.js` for alternative triage logic if needed.

### Supported Emergency Conditions

- **PPH** (Postpartum Hemorrhage) - Time window: 60 minutes
- **Eclampsia** - Time window: 90 minutes
- **Obstructed Labor** - Time window: 120 minutes
- **Normal Delivery** - Time window: 180 minutes
- **Preterm Labor** - Time window: 90 minutes
- **Miscarriage** - Time window: 120 minutes
- **Sepsis** - Time window: 60 minutes

## Deployment

### Deploy to Render

This backend is deployed on [Render](https://render.com). To deploy your own instance:

1. **Create a new Web Service** on Render
2. **Connect your repository**
3. **Configure the service:**
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Environment**: Node
4. **Add environment variables** in the Render dashboard:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `PORT` (optional, defaults to 3001)

5. **Deploy** - Render will automatically build and start your service

The production API is live at: **https://umma-na-backend.onrender.com**

### CORS Configuration

**Security Note**: The current CORS configuration allows all origins (`origin: '*'`) for development convenience. For production deployments, you should restrict this to your frontend domain:

```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## Frontend Integration

This backend is designed to work with the UMMA NA Frontend application.

- **Frontend Repository**: [https://github.com/Timamamu/umma-na-frontend]
- **Frontend Documentation**: See the frontend README for setup and configuration

## Project Structure

```
umma-na-backend/
├── constants/
│   └── EMERGENCY_CONDITIONS.js    # Condition mapping and requirements
├── utils/
│   └── conditionIdentifier.js     # Alternative triage logic
├── .env                            # Environment variables (not in git)
├── .gitignore
├── index.js                        # Main server file and API routes
├── package.json
└── README.md
```

## Development Notes

- No default `start` script is defined in `package.json` - run the server with `node index.js`
- Phone number validation expects Nigerian mobile format: `0[789][01]XXXXXXXX`
- Location freshness expires after 15 minutes for available drivers, 30 minutes for unavailable
- The two-tier driver selection process prioritizes emergency cases with real-time location requests

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For questions, issues, or feature requests, please open an issue on the GitHub repository.

## Related Projects

- **Mobile App**: [umma-na-backend](https://github.com/Timamamu/umma-na-mobile)
- **Web Frontend**: [umma-na-frontend](https://github.com/Timamamu/umma-na-frontend)


---

**Built for maternal health emergency response by Fatima for the UMMA NA team**
