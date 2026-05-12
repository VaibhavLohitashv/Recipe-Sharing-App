import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { PubSub } from 'graphql-subscriptions';
import helmet from 'helmet';

import typeDefs from './schema/typeDefs.js';
import resolvers from './resolvers/index.js';
import { getUser } from './utils/auth.js';

dotenv.config();

const app = express();

// SECURITY: Add Helmet middleware for HTTP security headers
app.use(helmet());

// SECURITY: Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

const httpServer = createServer(app);

// Create PubSub instance for subscriptions
export const pubsub = new PubSub();

// Create executable schema
const schema = makeExecutableSchema({ 
  typeDefs, 
  resolvers,
  // SECURITY: Add validation rules to prevent complex queries
  validationRules: [
    // Implement depth and complexity limiting
  ]
});

// Create Apollo Server
const server = new ApolloServer({
  schema,
  introspection: process.env.NODE_ENV !== 'production', // SECURITY: Disable introspection in production
  context: async ({ req }) => {
    const token = req?.headers?.authorization || '';
    const user = await getUser(token);
    return { user, pubsub };
  },
});

// Create WebSocket server
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Use WebSocket server
useServer(
  {
    schema,
    context: async (ctx) => {
      const token = ctx.connectionParams?.authToken || '';
      const user = await getUser(token);
      return { user, pubsub };
    },
  },
  wsServer
);

await server.start();
server.applyMiddleware({ app });

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('SECURITY: MongoDB connection URI is not defined');
  process.exit(1);
}

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(
        `Server ready at http://localhost:${PORT}${server.graphqlPath}`
      );
      console.log(
        `Subscriptions ready at ws://localhost:${PORT}${server.graphqlPath}`
      );
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  });