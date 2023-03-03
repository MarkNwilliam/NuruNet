// external packages
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
//const OpenAI = require('openai-api');

const { Configuration, OpenAIApi } = require("openai");

//const openai = new OpenAI(process.env.OPENAI_API_KEY);

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// Require the redis package and create a Redis client
const redis = require('redis');

// create a Redis client


const redisClient = redis.createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_SOCKET_HOST,
        port: process.env.REDIS_SOCKET_PORT
    }
});

redisClient.connect();

// connect to the Redis server
redisClient.on('connect', () => {
  console.log('Connected to Redis server');
});

// handle errors
redisClient.on('error', (error) => {
  console.error('Error connecting to Redis server:', error);
});



const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');
const uri = process.env.URL;
//const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
var accountSid = process.env.TWILIO_ACCOUNT_SID; // Your Account SID from www.twilio.com/console
var authToken = process.env.TWILIO_AUTH_TOKEN;   // Your Auth Token from www.twilio.com/console


let  userSchema = new mongoose.Schema({
    name: String,
    age: String,
    phoneNumber: String,
})
const User = mongoose.model('User', userSchema);

// Connect to the MongoDB Atlas cluster
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(()=> {
    console.log("db connect")
})
// Start the webapp
const webApp = express();

// Webapp settings
webApp.use(bodyParser.urlencoded({
    extended: true
}));
webApp.use(bodyParser.json());

// Server Port
const PORT = process.env.PORT || 3000;

// Home route
webApp.get('/', (req, res) => {
    res.send(`Hello World.!`);
});

const WA = require('../helper-function/whatsapp-send-message');




// Define the different states
const ConversationState = {
    ASKING_FOR_NAME: 'ASKING_FOR_NAME',
    ASKING_FOR_AGE: 'ASKING_FOR_AGE',
    READY: 'READY',
    START: 'START'
  };
  
  // Initialize the conversation state for each user
  const conversationState = {};
  
    // Handle incoming messages
    webApp.post('/whatsapp', async (req, res) => {
      const phoneNumber = req.body.From;
      const message = req.body.Body;
    
       // Check if user exists in the database
    const user = await User.findOne({ phoneNumber: phoneNumber });
      // Get the current conversation state for this user
      let state = conversationState[phoneNumber] || ConversationState.ASKING_FOR_NAME;
    
      
  
      if (user && user.name && user.age) {
        state = ConversationState.START;

      }
  
  
    switch (state) {
      case ConversationState.ASKING_FOR_NAME:
        // Ask for the user's name
        await WA.sendMessage('Hello! What is your name? (Just type the name. For example: Sarah Mubiru)', phoneNumber);
        state = ConversationState.ASKING_FOR_AGE;
        break;
  
      case ConversationState.ASKING_FOR_AGE:
        // Save the user's name and ask for their age
        await User.findOneAndUpdate(
          { phoneNumber: phoneNumber },
          { name: message },
          { upsert: true }
        );
        await WA.sendMessage(`Hi ${message}! What is your age? (Just type the age. For example:  25)`, phoneNumber);
        redisClient.set(phoneNumber, message)
        state = ConversationState.READY;
        break;
  
      case ConversationState.READY:
        // Save the user's age and process the message
        await User.findOneAndUpdate(
          { phoneNumber: phoneNumber },
          { age: message },
          { upsert: true }
        );
    
// Get the user's name from Redis
redisClient.get(phoneNumber)
.then(name => {
  WA.sendMessage(`Welcome to NuruNet, ${name}! We're here to help you study and learn. Ask me a question`, phoneNumber);
})

       state = ConversationState.START;
        break;

        case ConversationState.START:
     
        await processMessage(message, phoneNumber);

     
        break;
    }
  
    
      // Update the conversation state for this user
      conversationState[phoneNumber] = state;
    
      res.end();
    });
    
    // Process the user's message
    async function processMessage(message, phoneNumber) {
  
      
      try {
  
      // Get the user from the database based on their phone number
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        // If the user is not found, ask for their name and age
        await WA.sendMessage('Hello! What is your name? (Just type the name. For example "Sarah Mubiru")', phoneNumber);
        conversationState[phoneNumber] = ConversationState.ASKING_FOR_AGE;
        return;
      }
  // Check if the message is a greeting
  if (message.toLowerCase().match(/\b(hi|hello|hey|yo|hiya|sup|what's up|greetings|good (morning|afternoon|evening))\b/)) {
      let greeting = '';
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        greeting = 'Good morning';
      } else if (hour >= 12 && hour < 18) {
        greeting = 'Good afternoon';
      } else {
        greeting = 'Good evening';
      }
  
      redisClient.get(phoneNumber)
      .then(name => {
        const greetingMessage = `${greeting}, ${name}! How can I assist you? Ask me a question and tell me to explain it for you, Do you want an Analogy for a hard concept?, Just tell me the question and ask for one. Do you need some notes summaried?, Just give me the notes and tell me to summarise them `;
        WA.sendMessage(greetingMessage, phoneNumber);
      })
      .catch(err => {
        throw err;
      });
    
    return;
     
    
    }
        // Check if the message contains a bad word
        const badWords = ['porn'];
        const messageWords = message.toLowerCase().split(' ');
        const containsBadWord = messageWords.some(word => badWords.includes(word));
    
        if (containsBadWord) {
          await WA.sendMessage('Sorry, we do not answer questions related to porn.', phoneNumber);
          return;
        }
    
        // Call OpenAI API to get the answer
        const promp = `Q: ${message}\nA: `;
        const response = await openai.createCompletion({
          model: "text-davinci-003",
          prompt:promp,  
          temperature: 0.8,
          max_tokens:100,
          top_p:1,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
          stop: ["\n"],
          
        });
                                                  
        const answer = response.data.choices[0].text;
    
        // Retrieve the user's name from Redis
 const name = await redisClient.get(phoneNumber);
        // Send the answer back to the user

       await WA.sendMessage(`${name}, ${answer}` , phoneNumber);

      } catch (error) {
        // Handle the error here
        console.error(error);
        await WA.sendMessage('Sorry, there was an error processing your request.', phoneNumber);
      }
    }



    // Start the server
webApp.listen(PORT, () => {
    console.log(`Server is up and running at ${PORT}`);
    console.log(process.env.PORT);
});
