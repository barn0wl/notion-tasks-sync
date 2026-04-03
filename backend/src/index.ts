//Imports
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import syncApp from './core/app.js';

dotenv.config();
const app = express();

//middleware

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//start the server

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

//Run cycle on GET requests at origin route
app.get('/', (_req, res) => {
  syncApp.runCycle()
  .then( () => res.send('Done syncing tasks!').status(200))
  .catch( (error) => res.send(`Error while syncing tasks: ${error}`).status(400))
})