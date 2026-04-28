import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { createSecureServer } from 'http2';
import fs from 'fs';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { PubSub } from 'graphql-subscriptions';
import { depthLimit } from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-query-complexity';

import typeDefs from './schema/typeDefs.js';
import resolvers from './resolvers/index.js';
import { getUser } from './utils/auth.js';

dotenv.config();

const app = express();

// SECURITY FIX: Use HTTPS in production, HTTP in development
let httpServer;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;
  
  if (!keyPath || !certPath) {
    throw new Error('TLS_KEY_PATH and TLS_CERT_PATH environment variables are required in production');
  }
  
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error('TLS certificate files not found');
  }
  
  httpServer = createSecureServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }, app);
} else {
  httpServer = createServer(app);
}

// Create PubSub instance for subscriptions
export const pubsub = new PubSub();

// Create executable schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// SECURITY FIX: Add depth limiting and disable introspection in production
const validationRules = [
  depthLimit(10),
];

if (isProduction) {
  validationRules.push(
    createComplexityLimitRule({
      maxComplexity: 1000,
      variables: {},
      onComplete: (complexity) => {
        console.log('Query complexity:', complexity);
      },
    })
  );
}

// Create Apollo Server
const server = new ApolloServer({
  schema,
  validationRules,
  introspection: !isProduction,
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

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    const protocol = isProduction ? 'https' : 'http';
    httpServer.listen(PORT, () => {
      console.log(
        `Server ready at ${protocol}://localhost:${PORT}${server.graphqlPath}`
      );
      console.log(
        `Subscriptions ready at ws://localhost:${PORT}${server.graphqlPath}`
      );
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });