const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGODB_URI;
const app = express();
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json())
const port = process.env.PORT || 5000;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);
const verifyToken = async (req, res, next) => {
  const header = req.headers['authorization'];

  if (!header) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const token = header.split(" ")[1]; 

    const { payload } = await jwtVerify(token, JWKS);

    console.log("PAYLOAD:", payload);

    req.user = payload; 

    next();
  } catch (error) {
    console.log("JWT ERROR:", error.message);
    return res.status(401).json({ message: 'Forbidden' });
  }
};

async function run() {
  try {
     const db = client.db("bloody");
    const collection = db.collection("requests");
     const fundsCollection = db.collection("funds");

     app.get('/users', async (req, res) => {
        const users = await db.collection('user').find().toArray();
        res.json(users);
    });

   app.get('/my-requests', async (req, res) => {
  try {
    const { email } = req.query; // 🌟 Capture the email query parameter from the frontend

    if (!email) {
      return res.status(400).json({ message: "Requester email is required for isolation logic." });
    }

    // 🛡️ Filter the MongoDB query so it ONLY matches documents created by this user
    const requests = await collection.find({ requesterEmail: email }).toArray();
    res.json(requests);
  } catch (error) {
    console.error("Error fetching personal donor requests:", error);
    res.status(500).json({ message: "Error compiling personal request logs." });
  }
});
app.post('/api/fundings', async (req, res) => {
  try {
    const fundingData = req.body;
    fundingData.createdAt = new Date();
    const result = await fundsCollection.insertOne(fundingData);
    res.status(201).json({ message: "Funding request submitted successfully!", result });
  } catch (error) {
    console.error("Error submitting funding request:", error);
    res.status(500).json({ message: "Internal server error while submitting funding request." });
  }
});
app.patch('/my-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, donorDetails, requestedByRole } = req.body;

    // 1. Check if this is an Admin/Volunteer update action OR a Donor volunteering action
    // If donorDetails exists, it's a regular user applying through the modal card
    if (donorDetails) {
      const result = await db.collection("requests").updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            status: status || 'pending_donor', // Updates status flag
            donorDetails: {
              name: donorDetails.name,
              phone: donorDetails.phone,
              appliedAt: new Date(donorDetails.appliedAt)
            }
          } 
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Blood request document identity not found." });
      }

      return res.status(200).json({ message: "Donation intent captured successfully!", result });
    }

    // 2. Fallback: If no donorDetails, handle your existing Admin/Volunteer panel state changes
    if (requestedByRole !== 'admin' && requestedByRole !== 'volunteer') {
      return res.status(403).json({ message: "Forbidden: Unauthorized modification trace." });
    }

    const adminResult = await db.collection("requests").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    return res.json({ message: "Status updated successfully by management", adminResult });

  } catch (error) {
    console.error("Error processing request patch:", error);
    res.status(500).json({ message: "Internal server registry mutation error" });
  }
});

app.get('/blood-requests', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10 if not provided
    const skip = (Number(page) - 1) * Number(limit);
    const requests = await collection.find().skip(skip).limit(Number(limit)).toArray();
    const totalRequests = await collection.countDocuments();
    const totalPages = Math.ceil(totalRequests / Number(limit));
    res.json({ requests, totalRequests, totalPages });
  } catch (error) {
    res.status(500).json({ message: "Error fetching global requests" });
  }
});

    app.post('/add-request', verifyToken, async (req, res) => {
    const request = req.body;
    request.createdAt = new Date();
    const result = await collection.insertOne(request);
    res.json(result);
});

 app.get('/my-requests', async (req, res) => {
    const { email } = req.query;
    const requests = await collection.find({ requesterEmail: email }).toArray();
    res.json(requests);
});

app.get('/api-funds', async(req,res)=>{
   const funds = await fundsCollection.find().toArray();
   res.json(funds);
});

app.patch('/my-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, requestedByRole } = req.body; // Capture role passed from frontend body payload

    // 🛡️ Guardrail check: If they aren't an admin or a volunteer, block them from updating status
    if (requestedByRole !== 'admin' && requestedByRole !== 'volunteer') {
      return res.status(403).json({ message: "Forbidden: Only admins and volunteers can update statuses." });
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );
    
    res.json({ message: "Status updated successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Error mutating blood request state" });
  }
});

// 🛡️ STRICT GUARD: Explicitly blocks volunteers and donors from deleting registries
app.delete('/my-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.query; // Capture role passed from frontend queries

    // Lock down deletions strictly to 'admin' roles only
    if (role !== 'admin') {
      return res.status(403).json({ message: "Forbidden: Volunteers and donors do not have deletion privileges." });
    }

    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error deleting blood request doc" });
  }
});
// Inside your Express app (e.g., server.js or routes/user.js)
// Running on http://localhost:5000
app.patch('/blood-requests/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, donorDetails, requestedByRole } = req.body;

    // Donor volunteering through the modal card
    if (donorDetails) {
      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: status || 'pending_donor',
            donorDetails: {
              name: donorDetails.name,
              phone: donorDetails.phone,
              appliedAt: new Date(donorDetails.appliedAt)
            }
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Blood request not found." });
      }

      return res.status(200).json({ message: "Donation intent captured successfully!", result });
    }

    // Admin/Volunteer status change
    if (requestedByRole !== 'admin' && requestedByRole !== 'volunteer') {
      return res.status(403).json({ message: "Forbidden: Unauthorized modification." });
    }

    const adminResult = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    return res.json({ message: "Status updated successfully by management", adminResult });

  } catch (error) {
    console.error("Error processing blood-requests patch:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
app.get('/api/profile', async (req, res) => {
  try {
    const userEmail = req.query.email; 

    if (!userEmail) {
      return res.status(400).json({ message: "Email query parameter is required" });
    }
    const userProfile = await db.collection('user').findOne({ email: userEmail });

    if (!userProfile) {
      return res.status(404).json({ message: "User profile registry not found" });
    }
    return res.status(200).json(userProfile);
  } catch (error) {
    console.error("Backend profile route error:", error);
    return res.status(500).json({ message: "Internal server registry error" });
  }
});
    await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
