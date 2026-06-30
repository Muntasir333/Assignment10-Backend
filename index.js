const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const { MongoClient, ServerApiVersion } = require('mongodb');
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

async function run() {
  try {
     const db = client.db("bloody");
    const collection = db.collection("requests");
     const fundsCollection = db.collection("funds");

    app.post('/add-request', async (req, res) => {
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

app.get('/api-funds', async (req, res) => {
    const funds = await fundsCollection.find().toArray();
    res.json(funds);
});
// Inside your Express app (e.g., server.js or routes/user.js)
// Running on http://localhost:5000

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
    await client.db("admin").command({ ping: 1 });
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
