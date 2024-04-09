// Github Imports
// install with: npm install @octokit/webhooks
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';

// Github Proxy Imports
import EventSource from 'eventsource';

// Github Projects Imports
// import { graphql } from '@octokit/graphql';
import project from './helpers/github-projects.mjs';

// Sapphire Imports
import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';

// Event Handlers
import { handleGithubEvent } from './handlers/github.mjs';

import * as http from 'http';

// Load our environment variables
import dotenv from 'dotenv';
dotenv.config();

// Assign our environment variables
const webhookProxyUrl = process.env.WEBHOOK_PROXY_URL;
const discordBotToken = process.env.DISCORD_BOT_TOKEN;
const githubAccessToken = process.env.GITHUB_ACCESS_TOKEN;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
const githubOrg = process.env.GITHUB_ORG;
const githubProjectNumber = process.env.GITHUB_PROJECT_NUMBER;

// Setup Github API auth
await project.init(githubAccessToken, githubOrg, githubProjectNumber);

// setup github webhooks
const webhooks = new Webhooks({
  secret: webhookSecret,
});

// const handleIssueEvent = (payload) => {
//   console.log('New Issue Action on repository:', payload.repository.full_name);
//   console.log(payload.action);
//   console.log('Labels:');
//   console.log(payload.issue.labels);

//   // Add issue to project
//   for (const label of payload.issue.labels) {
//     if (label.name === 'OpenOasis') {
//       console.log('Adding issue to project');
//       project.addIssueToProject(payload.issue);
//     }
//   }

//   // TODO: if no OpenOasis label, remove from project
// };

// const handleGithubEvent = (name, payload) => {
//   switch (name) {
//     case 'issues':
//       console.log('Issue event received');
//       handleIssueEvent(payload);
//       break;
//     default:
//       console.log('Unknown event received');
//   }
// };

// const client = new SapphireClient({
//   intents: [
//     GatewayIntentBits.MessageContent,
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMessages,
//   ],
//   loadMessageCommandListeners: true,
// });

// client.login(discordBotToken);

// initialize Github Webhooks

webhooks.onAny(({ id, name, payload }) => {
  console.log(name, 'event received');
  handleGithubEvent(name, payload);
});

http.createServer(createNodeMiddleware(webhooks)).listen(3000);
// node vs mjs
// require('http').createServer(createNodeMiddleware(webhooks)).listen(3000);
// can now receive webhook events at /api/github/webhooks

//set Github Webhook Proxy

// const webhookProxyUrl = 'https://smee.io/baWXPCCcsUawEEG'; // replace with your own Webhook Proxy URL
const source = new EventSource(webhookProxyUrl);
source.onmessage = (event) => {
  const webhookEvent = JSON.parse(event.data);
  webhooks
    .verifyAndReceive({
      id: webhookEvent['x-request-id'],
      name: webhookEvent['x-github-event'],
      signature: webhookEvent['x-hub-signature'],
      payload: JSON.stringify(webhookEvent.body),
    })
    .catch(console.error);
};
