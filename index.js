//backend index.js
const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./firebaseKey.json');

const app = express();
const PORT = 3001;

const cors = require('cors');
//app.use(cors({
  //origin: 'http://localhost:3000', // Specifically allow your frontend
  //methods: ['GET', 'POST', 'PUT','PATCH', 'DELETE'],
  //allowedHeaders: ['Content-Type', 'Authorization']
//}));


app.use(cors({
  origin: '*', // Allow all origins during development
  methods: ['GET', 'POST', 'PUT','PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('UMMA NA Backend is running!');
});


// Utility: Phone number format validation (Nigerian mobile)
const isValidPhoneNumber = (phone) => /^0[789][01]\d{8}$/.test(phone);


// Simple auth endpoint for development
app.post('/auth/login', async (req, res) => {
  try {
    const { phoneNumber, username, password, role } = req.body;

    console.log('Received login request:', { phoneNumber, username, role });

    if (!phoneNumber || !username || !role) {
      console.log('Missing fields in request');
      return res.status(400).send('Missing phone number, username, or role');
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      console.log('Invalid phone number format');
      return res.status(400).send('Invalid phone number format');
    }

    let collection = role === 'chips' ? 'chipsAgents' : 'etsDrivers';
    console.log(`Searching in collection: ${collection}`);

    const userSnapshot = await db.collection(collection)
      .where('phoneNumber', '==', phoneNumber)
      .where('username', '==', username)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      console.log('No user found with provided phone number and username');
      return res.status(404).send('User not found or credentials incorrect');
    }

    const userData = userSnapshot.docs[0].data();
    console.log('User found:', userData);

    res.status(200).json({
      token: 'dev-token-123',
      user: {
        id: userSnapshot.docs[0].id,
        ...userData
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Error during login');
  }
});


// Register catchment area
app.post('/register-catchment-area', async (req, res) => {
  try {
    const { name, settlement, ward, lga, lat, lng } = req.body;

    if (!name || !settlement || !ward || !lga || lat == null || lng == null) {
      return res.status(400).send('Missing one or more required fields');
    }

    const duplicate = await db.collection('catchmentAreas')
      .where('name', '==', name)
      .where('ward', '==', ward)
      .where('lga', '==', lga)
      .get();

    if (!duplicate.empty) {
      return res.status(409).send('Catchment area with this name/ward/lga already exists');
    }

    const newCatchment = {
      name,
      settlement,
      ward,
      lga,
      location: { lat, lng },
      createdAt: new Date()
    };

    const docRef = await db.collection('catchmentAreas').add(newCatchment);
    res.status(200).send({ message: 'Catchment area registered!', id: docRef.id });
  } catch (err) {
    console.error('Error registering catchment area:', err);
    res.status(500).send('Error registering catchment area');
  }
});


app.get('/catchment-areas', async (req, res) => {
  try {
    const snapshot = await db.collection('catchmentAreas').get();
    const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(areas);
  } catch (err) {
    console.error('Error fetching catchment areas:', err);
    res.status(500).send('Error fetching catchment areas');
  }
});


// Update catchment area
app.put('/catchment-areas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, settlement, ward, lga, lat, lng } = req.body;

    if (!id || !name || !settlement || !ward || !lga || lat == null || lng == null) {
      return res.status(400).send('Missing one or more required fields');
    }

    // Check for duplicates with the same name/ward/lga, excluding the current document
    const duplicate = await db.collection('catchmentAreas')
      .where('name', '==', name)
      .where('ward', '==', ward)
      .where('lga', '==', lga)
      .get();

    // Make sure we're not counting the current document as a duplicate
    const isDuplicate = duplicate.docs.some(doc => doc.id !== id);
    if (isDuplicate) {
      return res.status(409).send('Catchment area with this name/ward/lga already exists');
    }

    const updateData = {
      name,
      settlement,
      ward,
      lga,
      location: { lat, lng },
      updatedAt: new Date()
    };

    await db.collection('catchmentAreas').doc(id).update(updateData);
    res.status(200).send({ message: 'Catchment area updated successfully' });
  } catch (err) {
    console.error('Error updating catchment area:', err);
    res.status(500).send('Error updating catchment area');
  }
});

// Delete catchment area
app.delete('/catchment-areas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).send('Missing catchment area ID');
    }
    
    // Check if the catchment area is referenced by any CHIPS agents
    const chipsAgentsSnapshot = await db.collection('chipsAgents')
      .where('catchmentAreaIds', 'array-contains', id)
      .get();
    
    // Check if the catchment area is referenced by any ETS drivers
    const etsDriversSnapshot = await db.collection('etsDrivers')
      .where('assignedCatchmentAreas', 'array-contains', id)
      .get();
    
    // If the catchment area is referenced by any agents or drivers, don't allow deletion
    if (!chipsAgentsSnapshot.empty || !etsDriversSnapshot.empty) {
      return res.status(409).send('Cannot delete catchment area as it is in use by CHIPS agents or ETS drivers');
    }
    
    // Delete the catchment area
    await db.collection('catchmentAreas').doc(id).delete();
    res.status(200).send({ message: 'Catchment area deleted successfully' });
  } catch (err) {
    console.error('Error deleting catchment area:', err);
    res.status(500).send('Error deleting catchment area');
  }
});


// Register CHIPS agent
app.post('/register-chips', async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, catchmentAreaIds } = req.body;

    if (!firstName || !lastName || !phoneNumber || !Array.isArray(catchmentAreaIds) || catchmentAreaIds.length === 0) {
      return res.status(400).send('Missing required fields');
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).send('Invalid phone number format');
    }

    const duplicate = await db.collection('chipsAgents')
      .where('phoneNumber', '==', phoneNumber)
      .get();
      
    if (!duplicate.empty) {
      return res.status(409).send('CHIPS agent with this phone number already exists');
    }

    const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;

    const newAgent = {
      firstName,
      lastName,
      phoneNumber,
      username,  
      catchmentAreaIds,
      createdAt: new Date()
    };

    const docRef = await db.collection('chipsAgents').add(newAgent);

    res.status(200).send({ message: 'CHIPS agent registered!', id: docRef.id });
  } catch (err) {
    console.error('Error registering CHIPS agent:', err);
    res.status(500).send('Error registering CHIPS agent');
  }
});




app.get('/chips-agents', async (req, res) => {
  try {
    const snapshot = await db.collection('chipsAgents').get();
    const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(agents);
  } catch (err) {
    console.error('Error fetching CHIPS agents:', err);
    res.status(500).send('Error fetching CHIPS agents');
  }
});


// Update CHIPS Agent
app.patch('/update-chips-agent/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
  
      if (!id || Object.keys(updateData).length === 0) {
        return res.status(400).send('No update data provided');
      }
  
      await db.collection('chipsAgents').doc(id).update(updateData);
      res.status(200).send('CHIPS agent updated successfully');
    } catch (err) {
      console.error('Error updating CHIPS agent:', err);
      res.status(500).send('Error updating CHIPS agent');
    }
});


// Delete CHIPS agent
app.delete('/chips-agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).send('Missing CHIPS agent ID');
    }
    
    // Check if the agent exists
    const agentDoc = await db.collection('chipsAgents').doc(id).get();
    if (!agentDoc.exists) {
      return res.status(404).send('CHIPS agent not found');
    }
    
    // Check if this agent is referenced in any active ride requests
    const rideRequestsSnapshot = await db.collection('rideRequests')
      .where('chipsAgentId', '==', id)
      .where('status', 'in', ['pending', 'accepted', 'in_progress'])
      .get();
    
    if (!rideRequestsSnapshot.empty) {
      return res.status(409).send('Cannot delete CHIPS agent with active ride requests');
    }
    
    // Delete the CHIPS agent
    await db.collection('chipsAgents').doc(id).delete();
    
    res.status(200).send({ message: 'CHIPS agent deleted successfully' });
  } catch (err) {
    console.error('Error deleting CHIPS agent:', err);
    res.status(500).send('Error deleting CHIPS agent');
  }
});


// Register ETS driver
app.post('/register-ets-driver', async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, vehicleType, catchmentAreaIds } = req.body;

    if (!firstName || !lastName || !phoneNumber || !vehicleType || !Array.isArray(catchmentAreaIds) || catchmentAreaIds.length === 0) {
      return res.status(400).send('Missing required fields');
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).send('Invalid phone number format');
    }

    const duplicate = await db.collection('etsDrivers')
      .where('phoneNumber', '==', phoneNumber)
      .get();
      
    if (!duplicate.empty) {
      return res.status(409).send('ETS driver with this phone number already exists');
    }

    const catchmentDocs = await Promise.all(
      catchmentAreaIds.map(id => db.collection('catchmentAreas').doc(id).get())
    );

    const coordinates = catchmentDocs
      .map(doc => doc.data()?.location)
      .filter(loc => loc && loc.lat != null && loc.lng != null);

    if (coordinates.length === 0) {
      return res.status(400).send('No valid locations found for selected catchment areas');
    }

    const calculateMidpoint = coords => {
      const latSum = coords.reduce((sum, loc) => sum + loc.lat, 0);
      const lngSum = coords.reduce((sum, loc) => sum + loc.lng, 0);
      return { lat: latSum / coords.length, lng: lngSum / coords.length };
    };

    const fallbackLocation = calculateMidpoint(coordinates);

    const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;

    const newDriver = {
      firstName,
      lastName,
      phoneNumber,
      username,  // 👈 Add username
      vehicleType,
      assignedCatchmentAreas: catchmentAreaIds,
      fallbackLocation,
      isAvailable: true,
      isLocationFresh: false,
      lastKnownLocation: null,
      lastLocationTimestamp: null,
      locationSource: null,
      createdAt: new Date()
    };

    const docRef = await db.collection('etsDrivers').add(newDriver);

    res.status(200).send({ message: 'ETS driver registered!', id: docRef.id });
  } catch (err) {
    console.error('Error registering ETS driver:', err);
    res.status(500).send('Error registering ETS driver');
  }
});




app.get('/ets-drivers', async (req, res) => {
  try {
    const snapshot = await db.collection('etsDrivers').get();
    const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(drivers);
  } catch (err) {
    console.error('Error fetching ETS drivers:', err);
    res.status(500).send('Error fetching ETS drivers');
  }
});

// Update ETS Driver
app.patch('/update-ets-driver/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
  
      if (!id || Object.keys(updateData).length === 0) {
        return res.status(400).send('No update data provided');
      }
  
      await db.collection('etsDrivers').doc(id).update(updateData);
      res.status(200).send('ETS driver updated successfully');
    } catch (err) {
      console.error('Error updating ETS driver:', err);
      res.status(500).send('Error updating ETS driver');
    }
});
  


// Update ETS Driver Location
// Updated driver location handler
app.post('/update-driver-location', async (req, res) => {
  try {
    const { driverId, lat, lng } = req.body;

    if (!driverId || lat == null || lng == null) {
      return res.status(400).send('Missing driverId, lat, or lng');
    }

    // Get the current driver data to check if this is a significant update
    const driverDoc = await db.collection('etsDrivers').doc(driverId).get();
    if (!driverDoc.exists) {
      return res.status(404).send('Driver not found');
    }

    const driverData = driverDoc.data();
    const currentTime = new Date();
    
    // Determine location source based on update type
    // This helps us track which updates came from background vs. foreground
    let locationSource = req.body.source || "mobile_app";
    
    // Calculate if this is a significant location change
    let isSignificantUpdate = true;
    if (driverData.lastKnownLocation && driverData.lastKnownLocation.lat && driverData.lastKnownLocation.lng) {
      const prevLat = driverData.lastKnownLocation.lat;
      const prevLng = driverData.lastKnownLocation.lng;
      
      // Calculate distance between last location and new location
      const distance = haversineDistance(prevLat, prevLng, lat, lng);
      
      // If driver is available, use a smaller threshold for significant updates
      // This ensures we track available drivers more closely
      const significantDistanceThreshold = driverData.isAvailable ? 0.05 : 0.2; // 50m for available, 200m for unavailable
      
      isSignificantUpdate = distance >= significantDistanceThreshold;
    }
    
    // Determine accuracy of location based on freshness
    // For immediate updates requested by the server, this should be high
    let accuracyLevel = req.body.accuracy || "medium";
    let isImmediate = req.body.immediate === true;
    
    // Set timestamp for when this location was actually captured
    // This may be different from server time if there was a delay in sending
    const locationTimestamp = req.body.timestamp ? new Date(req.body.timestamp) : currentTime;
    
    // Calculate freshness timeout based on driver availability
    const freshnessTimeout = driverData.isAvailable ? 10 * 60 * 1000 : 30 * 60 * 1000; // 10 min for available, 30 min for unavailable
    
    // Prepare the location update object
    const locationUpdate = {
      lastKnownLocation: { lat, lng },
      lastLocationTimestamp: locationTimestamp,
      locationSource,
      locationAccuracy: accuracyLevel,
      isLocationFresh: true,
      // Auto-expire the freshness based on the timestamp
      locationExpiresAt: new Date(locationTimestamp.getTime() + freshnessTimeout)
    };

    // Update the driver document
    await db.collection('etsDrivers').doc(driverId).update(locationUpdate);

    // Only add to history if it's a significant update to save database space
    if (isSignificantUpdate || isImmediate) {
      await db.collection('etsDrivers').doc(driverId).collection('locationHistory').add({
        lat,
        lng,
        timestamp: locationTimestamp,
        source: locationSource,
        accuracy: accuracyLevel,
        isAvailable: driverData.isAvailable
      });
    }

    // Return confirmation with update status
    res.status(200).json({
      message: 'Driver location updated',
      isSignificantUpdate,
      freshUntil: locationUpdate.locationExpiresAt
    });
  } catch (err) {
    console.error('Error updating driver location:', err);
    res.status(500).send('Internal Server Error');
  }
});


// New endpoint to request immediate location update from a specific driver
app.post('/request-driver-location', async (req, res) => {
  try {
    const { driverId } = req.body;
    
    if (!driverId) {
      return res.status(400).send('Missing driverId');
    }
    
    // Check if driver exists
    const driverDoc = await db.collection('etsDrivers').doc(driverId).get();
    if (!driverDoc.exists) {
      return res.status(404).send('Driver not found');
    }
    
    const driverData = driverDoc.data();
    
    // Get the push token for the driver
    const pushToken = driverData.pushToken;
    
    if (!pushToken) {
      return res.status(404).send('Driver has no registered push token');
    }
    
    // Create a notification to request immediate location update
    // This will wake up the app in the background and trigger LocationService.requestImmediateUpdate
    await admin.messaging().send({
      token: pushToken,
      data: {
        type: 'LOCATION_UPDATE',
        immediate: 'true',
        timestamp: new Date().toISOString()
      },
      android: {
        priority: 'high'
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            contentAvailable: true
          }
        }
      }
    });
    
    // Set a flag in the database that we're waiting for a location update
    await db.collection('etsDrivers').doc(driverId).update({
      pendingLocationUpdate: true,
      locationUpdateRequestedAt: new Date()
    });
    
    res.status(200).json({
      message: 'Location update requested',
      requestTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error requesting driver location:', err);
    res.status(500).send('Internal Server Error');
  }
});


// Delete ETS driver
app.delete('/ets-drivers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).send('Missing ETS driver ID');
    }
    
    // Check if the driver exists
    const driverDoc = await db.collection('etsDrivers').doc(id).get();
    if (!driverDoc.exists) {
      return res.status(404).send('ETS driver not found');
    }
    
    // Check if the driver is assigned to any active ride requests
    const activeRidesSnapshot = await db.collection('rideRequests')
      .where('driverAssigned.id', '==', id)
      .where('status', 'in', ['pending', 'accepted', 'in_progress'])
      .get();
    
    if (!activeRidesSnapshot.empty) {
      return res.status(409).send('Cannot delete ETS driver with active ride requests');
    }
    
    // Delete the ETS driver
    await db.collection('etsDrivers').doc(id).delete();
    
    res.status(200).send({ message: 'ETS driver deleted successfully' });
  } catch (err) {
    console.error('Error deleting ETS driver:', err);
    res.status(500).send('Error deleting ETS driver');
  }
});



// Register hospital
app.post('/register-hospital', async (req, res) => {
  try {
    const {
      name,
      ward,
      lga,
      lat,
      lng,
      facilityType,
      // Capability flags
      has_uterotonics,
      has_blood,
      has_anticonvulsants,
      has_antihypertensives,
      has_adrenaline,
      has_delivery_room,
      has_incubator,
      has_power,
      has_water,
      has_mva_kit,
      has_antibiotics,
      has_iv_fluids,
      has_theater,
      has_ultrasound,
      has_doctor,
      has_midwife_or_nurse,
      has_referral_transport,
      has_monitoring,
      staff_24_7
    } = req.body;

    // Validate required fields
    if (!name || !ward || !lga || lat == null || lng == null || !facilityType) {
      return res.status(400).send('Missing required fields');
    }

    // Check for duplicate facility (using name, ward, and lga as unique combination)
    const duplicateQuery = await db.collection('hospitals')
      .where('name', '==', name)
      .where('ward', '==', ward)
      .where('lga', '==', lga)
      .get();

    if (!duplicateQuery.empty) {
      return res.status(409).send('A facility with this name already exists in this ward and LGA');
    }

    // Additional check - prevent facilities with very close coordinates (potential duplicates)
    const DISTANCE_THRESHOLD = 0.001; // Approximately 100 meters
    
    const allFacilities = await db.collection('hospitals').get();
    
    // Check if any existing facility is too close (may be the same facility)
    for (const doc of allFacilities.docs) {
      const facility = doc.data();
      
      // Skip if location data is missing
      if (!facility.lat || !facility.lng) continue;
      
      // Calculate rough distance (this is not accurate for large distances but works for proximity checks)
      const latDiff = Math.abs(facility.lat - lat);
      const lngDiff = Math.abs(facility.lng - lng);
      
      if (latDiff < DISTANCE_THRESHOLD && lngDiff < DISTANCE_THRESHOLD) {
        return res.status(409).send(`A facility (${facility.name}) already exists at coordinates very close to these. Please verify this is not a duplicate.`);
      }
    }

    // Construct hospital record
    const newHospital = {
      name,
      ward,
      lga,
      lat,
      lng,
      facilityType,
      capabilities: {
        has_uterotonics,
        has_blood,
        has_anticonvulsants,
        has_antihypertensives,
        has_adrenaline,
        has_delivery_room,
        has_incubator,
        has_power,
        has_water,
        has_mva_kit,
        has_antibiotics,
        has_iv_fluids,
        has_theater,
        has_ultrasound,
        has_doctor,
        has_midwife_or_nurse,
        has_referral_transport,
        has_monitoring,
        staff_24_7
      },
      createdAt: new Date()
    };

    const docRef = await db.collection('hospitals').add(newHospital);
    res.status(200).send({ message: 'Hospital registered!', id: docRef.id });

  } catch (err) {
    console.error('Error registering hospital:', err);
    res.status(500).send('Error registering hospital');
  }
});


app.get('/hospitals', async (req, res) => {
  try {
    const snapshot = await db.collection('hospitals').get();
    const hospitals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(hospitals);
  } catch (err) {
    console.error('Error fetching hospitals:', err);
    res.status(500).send('Error fetching hospitals');
  }
});

// Update hospital
app.patch('/update-hospital/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
  
      if (!id || Object.keys(updateData).length === 0) {
        return res.status(400).send('No update data provided');
      }
  
      await db.collection('hospitals').doc(id).update(updateData);
      res.status(200).send('Hospital updated successfully');
    } catch (err) {
      console.error('Error updating hospital:', err);
      res.status(500).send('Error updating hospital');
    }
});

// Delete hospital
app.delete('/hospitals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).send('Missing hospital ID');
    }
    
    // Check if the hospital exists
    const hospitalDoc = await db.collection('hospitals').doc(id).get();
    if (!hospitalDoc.exists) {
      return res.status(404).send('Hospital not found');
    }
    
    // Check if the hospital is referenced in any active ride requests
    const rideRequestsSnapshot = await db.collection('rideRequests')
      .where('hospitalAssigned.id', '==', id)
      .where('status', 'in', ['pending', 'accepted', 'in_progress'])
      .get();
    
    if (!rideRequestsSnapshot.empty) {
      return res.status(409).send('Cannot delete hospital with active ride requests');
    }
    
    // Delete the hospital
    await db.collection('hospitals').doc(id).delete();
    
    res.status(200).send({ message: 'Hospital deleted successfully' });
  } catch (err) {
    console.error('Error deleting hospital:', err);
    res.status(500).send('Error deleting hospital');
  }
});


// Emergengy Complication rules
// Centralized configuration for complications
const complicationSpecs = {
  PPH: {
    ideal: [
      "has_midwife_or_nurse",
      "has_power",
      "has_water",
      "has_uterotonics",
      "has_blood"
    ],
    acceptable: [
      "has_midwife_or_nurse",
      "has_power",
      "has_water",
      "has_uterotonics"
    ],
    timeWindow: 60 // minutes
  },

  eclampsia: {
    ideal: [
      "has_anticonvulsants",         // Magnesium Sulfate or Diazepam
      "has_antihypertensives",       // Hydralazine or Nifedipine
      "has_monitoring",
      "has_ultrasound",
      "has_doctor",
      "has_delivery_room",
      "has_power"
    ],
    acceptable: [
      "has_anticonvulsants",
      "has_monitoring"
    ],
    timeWindow: 90
  },

  obstructed_labor: {
    ideal: [
      "has_theater",
      "has_power",
      "staff_24_7",
      "has_doctor",
      "has_ultrasound"
    ],
    acceptable: [
      "has_theater",
      "has_power",
      "staff_24_7"
    ],
    timeWindow: 120
  },

  normal_delivery: {
    ideal: [
      "has_delivery_room",
      "has_midwife_or_nurse",
      "has_power",
      "has_water"
    ],
    acceptable: [
      "has_delivery_room",
      "has_midwife_or_nurse"
    ],
    timeWindow: 180
  },

  preterm_labor: {
    ideal: [
      "has_incubator",
      "has_ultrasound",
      "has_doctor"
    ],
    acceptable: [
      "has_incubator",
      "has_midwife_or_nurse"
    ],
    timeWindow: 90
  },

  miscarriage: {
    ideal: [
      "has_mva_kit",
      "has_antibiotics",
      "has_iv_fluids",
      "has_ultrasound"
    ],
    acceptable: [
      "has_mva_kit"
    ],
    timeWindow: 120
  },

  sepsis: {
    ideal: [
      "has_antibiotics",
      "has_iv_fluids",
      "has_monitoring"
    ],
    acceptable: [
      "has_antibiotics",
      "has_iv_fluids"
    ],
    timeWindow: 60
  },

  unknown: {
    ideal: [],
    acceptable: [],
    timeWindow: 60
  }
};


// Calculate distance between two coordinates in km
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};




// Update request/ride
app.patch('/update-request/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
  
      if (!id || Object.keys(updateData).length === 0) {
        return res.status(400).send('No update data provided');
      }
  
      await db.collection('rideRequests').doc(id).update(updateData);
      res.status(200).send('Ride request updated successfully');
    } catch (err) {
      console.error('Error updating ride request:', err);
      res.status(500).send('Error updating ride request');
    }
});
 


// Get active ride for CHIPS agent
app.get('/chips-active-ride/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const rideSnapshot = await db.collection('rideRequests')
      .where('chipsAgentId', '==', id)
      .where('status', 'in', ['pending', 'accepted', 'in_progress'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (rideSnapshot.empty) {
      return res.status(200).json(null);
    }
    
    res.status(200).json({
      id: rideSnapshot.docs[0].id,
      ...rideSnapshot.docs[0].data()
    });
  } catch (err) {
    console.error('Error fetching active ride:', err);
    res.status(500).send('Error fetching active ride');
  }
});


// Get active ride for driver
app.get('/driver-active-ride/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate input
    if (!id) {
      return res.status(400).send('Missing driver ID');
    }
    
    console.log(`Fetching active ride for driver ID: ${id}`);

    // First, verify the driver exists
    const driverDoc = await db.collection('etsDrivers').doc(id).get();
    if (!driverDoc.exists) {
      console.log(`Driver with ID ${id} not found`);
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    // Look for active ride requests with this driver assigned
    // Using multiple status values to cover all active states
    const activeStatuses = [
      'pending', 
      'accepted', 
      'en_route_to_pickup', 
      'arrived_at_pickup', 
      'en_route_to_hospital', 
      'arrived_at_hospital'
    ];
    
    try {
      const rideSnapshot = await db.collection('rideRequests')
        .where('driverAssigned.id', '==', id)
        .where('status', 'in', activeStatuses)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      if (rideSnapshot.empty) {
        console.log(`No active rides found for driver ${id}`);
        return res.status(200).json(null);
      }
      
      // Get CHIPS agent details to include in response
      const rideData = rideSnapshot.docs[0].data();
      let chipsAgentDetails = null;
      
      if (rideData.chipsAgentId) {
        try {
          const chipsAgentDoc = await db.collection('chipsAgents').doc(rideData.chipsAgentId).get();
          if (chipsAgentDoc.exists) {
            const agentData = chipsAgentDoc.data();
            chipsAgentDetails = {
              name: `${agentData.firstName} ${agentData.lastName}`,
              phoneNumber: agentData.phoneNumber
            };
          }
        } catch (agentError) {
          console.error('Error fetching CHIPS agent details:', agentError);
          // Continue without agent details
        }
      }
      
      // Convert timestamps to ISO strings for easier client handling
      const responseData = {
        id: rideSnapshot.docs[0].id,
        ...rideData,
        createdAt: rideData.createdAt && typeof rideData.createdAt.toDate === 'function' 
          ? rideData.createdAt.toDate().toISOString() 
          : null,
        chipsAgentDetails
      };
      
      console.log(`Found active ride ${responseData.id} for driver ${id}`);
      res.status(200).json(responseData);
    } catch (queryError) {
      console.error('Error in ride request query:', queryError);
      throw queryError; // Re-throw to be caught by outer try/catch
    }
  } catch (err) {
    console.error('Error fetching driver active ride:', err);
    res.status(500).json({ 
      error: 'Error fetching driver active ride', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Get ride history for CHIPS agent
app.get('/chips-ride-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const ridesSnapshot = await db.collection('rideRequests')
      .where('chipsAgentId', '==', id)
      .orderBy('createdAt', 'desc')
      .get();
    
    const rides = ridesSnapshot.docs.map(doc => {
      const data = doc.data();
      // Convert Firestore timestamps to ISO strings
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' 
          ? data.createdAt.toDate().toISOString() 
          : null
      };
    });
    
    res.status(200).json(rides);
  } catch (err) {
    console.error('Error fetching ride history:', err);
    res.status(500).send('Error fetching ride history');
  }
});

// Get ride history for driver
// Simplified endpoint that doesn't require a composite index
// Replace this in your backend index.js file

// Get ride history for driver
app.get('/driver-ride-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate input
    if (!id) {
      return res.status(400).send('Missing driver ID');
    }
    
    console.log(`Fetching ride history for driver ID: ${id}`);
    
    try {
      // Simplified query that doesn't require a complex index
      // Just filter by driver ID
      const ridesSnapshot = await db.collection('rideRequests')
        .where('driverAssigned.id', '==', id)
        .get();
      
      if (ridesSnapshot.empty) {
        console.log(`No rides found for driver ${id}`);
        return res.status(200).json([]);
      }
      
      // Map documents to include ID and convert timestamps
      const rides = ridesSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Convert Firestore timestamp to ISO string if possible
        let createdAtISO = null;
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAtISO = data.createdAt.toDate().toISOString();
          } else if (data.createdAt.seconds) {
            createdAtISO = new Date(data.createdAt.seconds * 1000).toISOString();
          }
        }
        
        return {
          id: doc.id,
          ...data,
          createdAt: createdAtISO || data.createdAt
        };
      });
      
      // Sort by createdAt (newest first)
      rides.sort((a, b) => {
        // Handle different timestamp formats
        const getTimestamp = (item) => {
          if (!item.createdAt) return 0;
          if (typeof item.createdAt === 'string') return new Date(item.createdAt).getTime();
          if (item.createdAt.seconds) return item.createdAt.seconds * 1000;
          return 0;
        };
        
        return getTimestamp(b) - getTimestamp(a);
      });
      
      // Enhance with CHIPS agent details where needed
      const enhancedRides = await Promise.all(rides.map(async (ride) => {
        if (ride.chipsAgentId) {
          try {
            const chipsAgentDoc = await db.collection('chipsAgents').doc(ride.chipsAgentId).get();
            if (chipsAgentDoc.exists) {
              const agentData = chipsAgentDoc.data();
              ride.chipsAgentDetails = {
                name: `${agentData.firstName} ${agentData.lastName}`,
                phoneNumber: agentData.phoneNumber
              };
            }
          } catch (error) {
            console.error(`Error fetching CHIPS agent details for ride ${ride.id}:`, error);
            // Continue without agent details
          }
        }
        return ride;
      }));
      
      console.log(`Returning ${enhancedRides.length} ride history items for driver ${id}`);
      res.status(200).json(enhancedRides);
    } catch (queryError) {
      console.error('Error in ride request query:', queryError);
      throw queryError; // Re-throw to be caught by outer try/catch
    }
  } catch (err) {
    console.error('Error fetching driver ride history:', err);
    res.status(500).json({ 
      error: 'Error fetching driver ride history', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Get pending ride requests for drivers
app.get('/driver-pending-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get driver's assigned catchment areas
    const driverDoc = await db.collection('etsDrivers').doc(id).get();
    if (!driverDoc.exists) {
      return res.status(404).send('Driver not found');
    }
    
    const driverData = driverDoc.data();
    const assignedAreas = driverData.assignedCatchmentAreas || [];
    
    // For now, just get all pending requests
    // In production, you'd filter by geographic proximity or assigned areas
    const requestsSnapshot = await db.collection('rideRequests')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    const requests = requestsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.status(200).json(requests);
  } catch (err) {
    console.error('Error fetching pending requests:', err);
    res.status(500).send('Error fetching pending requests');
  }
});



//************************************************************************************ 
// Request ride endpoint that processes symptoms instead of direct condition diagnosis
// Implement the two-tier driver selection process for ride requests
app.post('/request-ride', async (req, res) => {
  console.log('Request ride endpoint hit with:', req.body);
  try {
    const { chipsAgentId, symptoms, pickupLat, pickupLng } = req.body;
    
    console.log('Extracted ride parameters:', { chipsAgentId, symptoms, pickupLat, pickupLng });

    if (!chipsAgentId || !Array.isArray(symptoms) || symptoms.length === 0 || pickupLat == null || pickupLng == null) {
      console.log('Missing required fields:', { chipsAgentId, symptoms, pickupLat, pickupLng });
      return res.status(400).send('Missing required fields');
    }

    // Import our condition mapping functionality
    const { identifyCondition, EMERGENCY_CONDITIONS, CAPABILITY_REQUIREMENTS, VEHICLE_REQUIREMENTS } = require('./constants/EMERGENCY_CONDITIONS');

    // Map symptoms to a complication type using the defined conditions
    const complicationType = identifyCondition(symptoms);
    console.log('Identified complication:', complicationType);

    // Get the capability requirements for this condition
    const conditionRequirements = CAPABILITY_REQUIREMENTS.find(c => c.condition === complicationType);
    if (!conditionRequirements) {
      console.log('Could not determine appropriate care requirements');
      return res.status(400).send('Could not determine appropriate care requirements');
    }
    
    const { ideal, acceptable, timeWindow } = conditionRequirements;
    console.log('Complication requirements:', { ideal, acceptable, timeWindow });

    // Get vehicle requirements for this condition
    let vehicleRules = VEHICLE_REQUIREMENTS.find(v => v.condition === complicationType);
    if (!vehicleRules) {
      // Default to car-only for safety if not found
      vehicleRules = {
        condition: complicationType,
        allowed: ["car"],
        preferred: "car"
      };
    }
    
    // Speed estimates for different vehicle types
    const speedMap = {
      motorcycle: 30, // km/h
      car: 50        // km/h
    };

    // ------------ TIER 1: INITIAL DRIVER SELECTION ------------
    // Fetch available drivers with basic filtering
    const driversSnapshot = await db.collection('etsDrivers')
      .where('isAvailable', '==', true)
      .get();
    
    const allDrivers = driversSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${allDrivers.length} available drivers`);
    
    if (allDrivers.length === 0) {
      console.log('No available drivers found');
      return res.status(404).send('No available drivers found');
    }

    // Initial filtering based on vehicle type and valid location
    const initialDrivers = allDrivers
      .filter(d => vehicleRules.allowed.includes(d.vehicleType))
      .map(d => {
        // Use the last known location if it's fresh, otherwise use fallback
        const isLocationFresh = d.isLocationFresh === true && 
          d.lastLocationTimestamp && 
          new Date(d.lastLocationTimestamp.seconds * 1000) > new Date(Date.now() - 15 * 60 * 1000); // Within last 15 min
        
        const loc = isLocationFresh ? d.lastKnownLocation : d.fallbackLocation;
        if (!loc || loc.lat == null || loc.lng == null) return null;

        const distanceToPickup = haversineDistance(loc.lat, loc.lng, pickupLat, pickupLng);
        return {
          ...d,
          distanceToPickup,
          isLocationFresh,
          locationSource: isLocationFresh ? d.locationSource : 'fallback',
          speed: speedMap[d.vehicleType] || 40, // Default to 40 km/h if unknown
          vehicle: {
            type: d.vehicleType,
            isPreferable: d.vehicleType === vehicleRules.preferred
          }
        };
      })
      .filter(Boolean); // Remove null entries
    
    // Get the initial set of candidates (up to 7 closest drivers)
    const maxInitialDrivers = Math.min(7, initialDrivers.length);
    const initialCandidates = initialDrivers
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup)
      .slice(0, maxInitialDrivers);
    
    console.log(`Selected ${initialCandidates.length} initial driver candidates`);
    
    // ------------ TIER 2: REQUEST FRESH LOCATIONS ------------
    // For emergent cases, request immediate location updates from all candidates
    const isEmergent = complicationType === 'PPH' || complicationType === 'eclampsia' || complicationType === 'obstructed_labor';
    
    if (isEmergent && initialCandidates.length > 0) {
      console.log(`Emergent case detected. Requesting fresh locations for ${initialCandidates.length} drivers`);
      
      // Request fresh locations from all initial candidates
      const locationUpdatePromises = initialCandidates
        .filter(driver => driver.pushToken && !driver.isLocationFresh) // Only those with push tokens and stale locations
        .map(driver => {
          // Log the request
          console.log(`Requesting immediate location update for driver ${driver.id}`);
          
          // Create a flag in the database
          return db.collection('etsDrivers').doc(driver.id).update({
            pendingLocationUpdate: true,
            locationUpdateRequestedAt: new Date()
          })
          .then(() => {
            // Send push notification to request location
            return admin.messaging().send({
              token: driver.pushToken,
              data: {
                type: 'LOCATION_UPDATE',
                immediate: 'true',
                timestamp: new Date().toISOString()
              },
              android: {
                priority: 'high'
              },
              apns: {
                headers: {
                  'apns-priority': '10'
                },
                payload: {
                  aps: {
                    contentAvailable: true
                  }
                }
              }
            });
          })
          .catch(err => {
            console.error(`Error requesting location update for driver ${driver.id}:`, err);
            // Continue despite errors for any individual driver
            return null;
          });
        });
      
      // Wait for all location update requests (but don't wait for responses)
      await Promise.all(locationUpdatePromises);
      
      // For emergent cases, wait briefly to collect fresh locations (max 2 seconds)
      if (isEmergent) {
        console.log('Waiting briefly for location updates to come in...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // ------------ FINAL DRIVER SELECTION ------------
    // Re-fetch the drivers to get any fresh locations that may have come in
    const refreshedDriversSnapshot = await db.collection('etsDrivers')
      .where('isAvailable', '==', true)
      .get();
    
    // Only include drivers from our initial candidate list
    const candidateIds = initialCandidates.map(d => d.id);
    
    // Process the refreshed data
    const refreshedCandidates = refreshedDriversSnapshot.docs
      .filter(doc => candidateIds.includes(doc.id))
      .map(doc => {
        const data = doc.data();
        // Use the last known location if it's fresh, otherwise use fallback
        const isLocationFresh = data.isLocationFresh === true && 
          data.lastLocationTimestamp && 
          new Date(data.lastLocationTimestamp.seconds * 1000) > new Date(Date.now() - 15 * 60 * 1000);
        
        const loc = isLocationFresh ? data.lastKnownLocation : data.fallbackLocation;
        if (!loc || loc.lat == null || loc.lng == null) {
          // This shouldn't happen since we already filtered, but just in case
          const initialCandidate = initialCandidates.find(d => d.id === doc.id);
          if (initialCandidate && initialCandidate.distanceToPickup) {
            // Use the initial data as fallback
            return {
              id: doc.id,
              ...data,
              ...initialCandidate
            };
          }
          return null;
        }

        const distanceToPickup = haversineDistance(loc.lat, loc.lng, pickupLat, pickupLng);
        return {
          id: doc.id,
          ...data,
          distanceToPickup,
          isLocationFresh,
          locationSource: isLocationFresh ? data.locationSource : 'fallback',
          speed: speedMap[data.vehicleType] || 40,
          vehicle: {
            type: data.vehicleType,
            isPreferable: data.vehicleType === vehicleRules.preferred
          }
        };
      })
      .filter(Boolean);
    
    // Final sorting and selection criteria:
    // 1. For emergency cases: minimize total time (including preferred vehicle)
    // 2. For regular cases: prefer better vehicle type, then minimize distance
    const finalCandidates = refreshedCandidates.sort((a, b) => {
      // For emergency cases, time is most critical
      if (isEmergent) {
        const timeA = a.distanceToPickup / a.speed * 60; // Minutes to pickup
        const timeB = b.distanceToPickup / b.speed * 60;
        
        // If times are similar (within 3 min), prefer the preferred vehicle
        if (Math.abs(timeA - timeB) < 3) {
          if (a.vehicle.isPreferable && !b.vehicle.isPreferable) return -1;
          if (!a.vehicle.isPreferable && b.vehicle.isPreferable) return 1;
        }
        
        return timeA - timeB;
      }
      
      // For non-emergent cases, vehicle type is more important
      if (a.vehicle.isPreferable && !b.vehicle.isPreferable) return -1;
      if (!a.vehicle.isPreferable && b.vehicle.isPreferable) return 1;
      
      // If same vehicle preference, use distance
      return a.distanceToPickup - b.distanceToPickup;
    });
    
    // Select up to 5 best candidates for notification
    const maxFinalDrivers = Math.min(5, finalCandidates.length);
    const selectedDrivers = finalCandidates.slice(0, maxFinalDrivers);
    
    console.log(`Final selection: ${selectedDrivers.length} drivers`);
    
    if (selectedDrivers.length === 0) {
      console.log('No suitable drivers found after selection process');
      return res.status(404).send('No suitable ETS driver available');
    }

    // Use the top driver for the ride assignment
    const topDriver = selectedDrivers[0];
    console.log('Selected top driver:', { 
      id: topDriver.id, 
      name: `${topDriver.firstName} ${topDriver.lastName}`,
      vehicleType: topDriver.vehicleType,
      distance: topDriver.distanceToPickup,
      locationFresh: topDriver.isLocationFresh
    });

    // Fetch hospitals
    const hospitalsSnapshot = await db.collection('hospitals').get();
    console.log(`Found ${hospitalsSnapshot.docs.length} hospitals`);
    
    if (hospitalsSnapshot.docs.length === 0) {
      console.log('No hospitals found in database');
      return res.status(404).send('No hospitals found');
    }

    // Find suitable hospitals based on capabilities
    const suitableHospitals = hospitalsSnapshot.docs
      .map(doc => {
        const data = doc.data();
        const caps = data.capabilities || {};
        const meetsIdeal = ideal.every(k => caps[k]);
        const meetsAcceptable = acceptable.every(k => caps[k]);
        
        if (!meetsIdeal && !meetsAcceptable) return null;

        const distChipsToHospital = haversineDistance(pickupLat, pickupLng, data.lat, data.lng);
        const totalTime = (topDriver.distanceToPickup / topDriver.speed + distChipsToHospital / topDriver.speed) * 60;

        let score = -1;
        if (meetsIdeal && totalTime <= timeWindow) score = 100;
        else if (meetsAcceptable && totalTime <= timeWindow) score = 75;
        else if (meetsIdeal && totalTime <= timeWindow + 30) score = 60;
        else if (meetsAcceptable && totalTime <= timeWindow + 30) score = 40;
        if (score < 0) return null;

        return {
          id: doc.id,
          name: data.name,
          location: { lat: data.lat, lng: data.lng },
          meetsIdeal,
          meetsAcceptable,
          timeToHospital: distChipsToHospital / topDriver.speed * 60,
          totalTripTime: totalTime,
          score
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    console.log(`Found ${suitableHospitals.length} suitable hospitals for ${complicationType}`);
    
    if (suitableHospitals.length === 0) {
      console.log('No suitable hospitals found with required capabilities');
      return res.status(404).send('No suitable hospital found');
    }

    const bestHospital = suitableHospitals[0];
    console.log('Selected best hospital:', { 
      id: bestHospital.id, 
      name: bestHospital.name, 
      score: bestHospital.score,
      tripTime: bestHospital.totalTripTime
    });

    // Get the condition details
    const conditionDetails = EMERGENCY_CONDITIONS.find(c => c.id === complicationType);
    
    // Store the original symptoms and identified condition for reference
    const newRequest = {
      chipsAgentId,
      symptoms,
      complicationType,
      conditionName: conditionDetails ? conditionDetails.name : 'Unknown Emergency',
      pickupLocation: { lat: pickupLat, lng: pickupLng },
      driverAssigned: {
        id: topDriver.id,
        name: `${topDriver.firstName} ${topDriver.lastName}`,
        phoneNumber: topDriver.phoneNumber,
        vehicleType: topDriver.vehicleType,
        distanceToChips: topDriver.distanceToPickup,
        estimatedPickupTimeMin: (topDriver.distanceToPickup / topDriver.speed) * 60,
        locationFreshness: topDriver.isLocationFresh ? 'current' : 'estimated'
      },
      hospitalAssigned: bestHospital,
      totalTripTime: bestHospital.totalTripTime,
      status: "pending",
      createdAt: new Date(),
      // Add emergency level to enable different notification handling
      emergencyLevel: isEmergent ? 'HIGH' : 'MEDIUM',
      // Add list of all candidate drivers for notification
      candidateDrivers: selectedDrivers.map(d => ({
        id: d.id,
        pushToken: d.pushToken || null
      }))
    };

    console.log('Creating new ride request with data:', {
      chipsAgentId: newRequest.chipsAgentId,
      complicationType: newRequest.complicationType,
      conditionName: newRequest.conditionName,
      symptomsCount: newRequest.symptoms.length,
      driverId: newRequest.driverAssigned.id,
      hospitalId: newRequest.hospitalAssigned.id,
      candidateCount: newRequest.candidateDrivers.length
    });

    const docRef = await db.collection('rideRequests').add(newRequest);
    console.log('Ride request created with ID:', docRef.id);

    // Send notifications to all candidate drivers about the new request
    const notificationPromises = selectedDrivers
      .filter(driver => driver.pushToken)
      .map(driver => {
        return admin.messaging().send({
          token: driver.pushToken,
          data: {
            type: 'RIDE_REQUEST',
            rideId: docRef.id,
            emergencyLevel: isEmergent ? 'HIGH' : 'MEDIUM',
            patientLocation: `${pickupLat.toFixed(6)},${pickupLng.toFixed(6)}`,
            condition: complicationType,
            timestamp: new Date().toISOString()
          },
          notification: {
            title: isEmergent ? 'URGENT: Emergency Ride Request' : 'New Ride Request',
            body: `Pickup ${(driver.distanceToPickup).toFixed(1)}km away. Condition: ${conditionDetails ? conditionDetails.name : 'Medical Emergency'}`
          },
          android: {
            priority: isEmergent ? 'high' : 'normal',
            notification: {
              channelId: isEmergent ? 'emergency-notifications' : 'ride-requests',
              priority: isEmergent ? 'max' : 'high'
            }
          },
          apns: {
            payload: {
              aps: {
                sound: isEmergent ? 'critical.wav' : 'default',
                category: 'RIDE_REQUEST'
              }
            },
            headers: {
              'apns-priority': isEmergent ? '10' : '5'
            }
          }
        })
        .catch(err => {
          console.error(`Error sending notification to driver ${driver.id}:`, err);
          return null;
        });
      });

    // Wait for notifications to be sent, but don't block the response
    Promise.all(notificationPromises)
      .then(results => {
        console.log(`Sent ${results.filter(Boolean).length} driver notifications`);
      })
      .catch(err => {
        console.error('Error sending driver notifications:', err);
      });

    res.status(200).json({
      message: "Ride request created",
      requestId: docRef.id,
      condition: {
        id: complicationType,
        name: conditionDetails ? conditionDetails.name : 'Unknown Emergency'
      },
      hospital: bestHospital,
      driver: {
        id: topDriver.id,
        name: `${topDriver.firstName} ${topDriver.lastName}`,
        estimatedPickupTime: Math.round(newRequest.driverAssigned.estimatedPickupTimeMin)
      },
      candidateCount: selectedDrivers.length
    });

  } catch (err) {
    console.error('Error handling ride request:', err);
    res.status(500).send('Internal server error');
  }
});



//**************************************************************************************

// New endpoint to handle driver response to ride request
app.post('/respond-to-ride-request', async (req, res) => {
  try {
    const { driverId, rideId, response } = req.body;
    
    if (!driverId || !rideId || !response) {
      return res.status(400).send('Missing required fields');
    }
    
    // Validate that the response is valid
    if (!['accept', 'decline'].includes(response)) {
      return res.status(400).send('Invalid response. Must be "accept" or "decline"');
    }
    
    // Get the ride request
    const rideDoc = await db.collection('rideRequests').doc(rideId).get();
    if (!rideDoc.exists) {
      return res.status(404).send('Ride request not found');
    }
    
    const rideData = rideDoc.data();
    
    // Check if this driver is in the candidate list
    const isCandidate = rideData.candidateDrivers && 
      rideData.candidateDrivers.some(d => d.id === driverId);
    
    if (!isCandidate) {
      return res.status(403).send('Driver is not a candidate for this ride');
    }
    
    // Check if the ride is still in pending status
    if (rideData.status !== 'pending') {
      return res.status(409).send(`Ride is already ${rideData.status}`);
    }
    
    if (response === 'accept') {
      // Update the ride status to accepted
      await db.collection('rideRequests').doc(rideId).update({
        status: 'accepted',
        acceptedBy: driverId,
        acceptedAt: new Date(),
        // Update the driver assigned field if not the original driver
        ...(driverId !== rideData.driverAssigned.id ? {
          'driverAssigned.id': driverId,
          'driverAssigned.overridden': true
        } : {})
      });
      
      // Update the driver's status
      await db.collection('etsDrivers').doc(driverId).update({
        currentRideId: rideId,
        lastRideUpdateTime: new Date()
      });
      
      // Notify CHIPS agent
      if (rideData.chipsAgentId) {
        const chipsDoc = await db.collection('chipsAgents').doc(rideData.chipsAgentId).get();
        if (chipsDoc.exists) {
          const chipsData = chipsDoc.data();
          if (chipsData.pushToken) {
            await admin.messaging().send({
              token: chipsData.pushToken,
              data: {
                type: 'RIDE_ACCEPTED',
                rideId,
                driverId,
                timestamp: new Date().toISOString()
              },
              notification: {
                title: '✅ Driver Accepted Your Request',
                body: 'A driver has accepted your emergency transport request'
              }
            }).catch(err => {
              console.error('Error sending notification to CHIPS agent:', err);
            });
          }
        }
      }
      
      res.status(200).json({
        message: 'Ride request accepted',
        rideId,
        nextStatus: 'en_route_to_pickup'
      });
    } else {
      // Just add this driver to the declined list
      await db.collection('rideRequests').doc(rideId).update({
        declinedDrivers: admin.firestore.FieldValue.arrayUnion(driverId),
        declinedAt: admin.firestore.FieldValue.arrayUnion(new Date())
      });
      
      res.status(200).json({
        message: 'Ride request declined',
        rideId
      });
    }
  } catch (err) {
    console.error('Error responding to ride request:', err);
    res.status(500).send('Internal Server Error');
  }
});






// Start server
app.listen(PORT, () => {
  console.log(`Server is live at http://localhost:${PORT}`);
});
