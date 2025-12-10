# slack-to-slashwork

A web request handler that pushes new messages from Slack channels into Slashwork groups. The
request handler expects to be called by Slack's Event Subscriptions API, and uses Slashwork's
GraphQL service to mirror new messages in designated Slack channels into Slashwork groups.

## Installation

```bash
npm install slack-to-slashwork
```

## Quick Start

```typescript
import { createSlackWebhook } from "slack-to-slashwork";

const handler = createSlackWebhook({
  graphqlEndpoint: "https://yourcompany.slashwork.com/api/graphql",
  bearerToken: process.env.SLASHWORK_API_TOKEN,
  groupMappings: {
    C01234567: "group-id-abc", // Slack channel ID -> Slashwork group ID
    C89012345: "group-id-def",
  },
});
```

## Usage with Express

```typescript
import express from "express";
import { createSlackWebhook } from "slack-to-slashwork";

const app = express();
app.use(express.json());

const slackHandler = createSlackWebhook({
  graphqlEndpoint: "https://yourcompany.slashwork.com/api/graphql",
  bearerToken: process.env.SLASHWORK_API_TOKEN,
  groupMappings: {
    C01234567: "group-id-abc",
  },
});

app.post("/slack/events", slackHandler);

app.listen(3000);
```

## Usage with Firebase Functions (v2)

```typescript
import { onRequest } from "firebase-functions/v2/https";
import { createSlackWebhook } from "slack-to-slashwork";

const slackHandler = createSlackWebhook({
  graphqlEndpoint: "https://yourcompany.slashwork.com/api/graphql",
  bearerToken: process.env.SLASHWORK_API_TOKEN,
  groupMappings: {
    C01234567: "group-id-abc",
  },
});

export const slackEvents = onRequest(slackHandler);
```

## Configuration

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `graphqlEndpoint` | `string` | Your Slashwork GraphQL API endpoint |
| `bearerToken` | `string` | API token for authenticating with Slashwork |
| `groupMappings` | `Record<string, string>` | Map of Slack channel IDs to Slashwork group IDs |

### Optional Options

| Option | Type | Description |
|--------|------|-------------|
| `slackIdMap` | `SlackIdMap` | Enable threaded conversation support (see below) |
| `getSlackUsername` | `(userId: string) => string \| Promise<string>` | Resolve user IDs to usernames for message prefacing |

## Threaded Conversations

To mirror Slack threads as Slashwork comments, provide a `slackIdMap` implementation:

```typescript
import { createSlackWebhook, SlackIdMap } from "slack-to-slashwork";

// Example: in-memory storage (use a database in production)
const idMappings = new Map<string, string>();

const slackIdMap: SlackIdMap = {
  saveSlackId: (slackId, slashworkId) => {
    idMappings.set(slackId, slashworkId);
  },
  findSlackIdMapping: (slackId) => {
    return idMappings.get(slackId);
  },
};

const handler = createSlackWebhook({
  graphqlEndpoint: "https://yourcompany.slashwork.com/api/graphql",
  bearerToken: process.env.SLASHWORK_API_TOKEN,
  groupMappings: { C01234567: "group-id-abc" },
  slackIdMap,
});
```

When configured:
- Top-level Slack messages create Slashwork posts
- Threaded replies create comments on the corresponding post

## Username Prefacing

To prefix messages with the sender's name (e.g., `[Alice] Hello everyone!`), provide a `getSlackUsername` function:

```typescript
import { WebClient } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const handler = createSlackWebhook({
  graphqlEndpoint: "https://yourcompany.slashwork.com/api/graphql",
  bearerToken: process.env.SLASHWORK_API_TOKEN,
  groupMappings: { C01234567: "group-id-abc" },
  getSlackUsername: async (userId) => {
    const result = await slackClient.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || "";
  },
});
```

## Setting Up Slack

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Event Subscriptions** and set your Request URL to your webhook endpoint
3. Subscribe to the `message.channels` bot event (and/or `message.groups` for private channels)
4. Install the app to your workspace
5. Note the channel IDs you want to mirror (visible in channel details or via the Slack API)
6. Invite the app/bot into each channel you want to mirror

## TypeScript

This package includes TypeScript definitions. Key exports:

```typescript
import {
  createSlackWebhook,
  SlackWebhookConfig,
  SlackWebhookHandler,
  SlackWebhookRequest,
  SlackWebhookResponse,
  SlackIdMap,
  SlackWebhookPayload,
  SlackUrlVerification,
  EnvelopedEvent,
  SlackEvent,
} from "slack-to-slashwork";
```

## License

MIT
