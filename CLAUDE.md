# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript library that bridges Slack and Slashwork by forwarding messages from Slack channels to Slashwork groups via webhooks. It handles the Slack Events API and translates messages into Slashwork GraphQL mutations.

## Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Run TypeScript directly with ts-node
npm start          # Run compiled code from dist/
npm run release    # Release new version (builds, updates changelog, publishes)
```

No test or lint commands are configured.

## Architecture

The entire library is contained in a single file (`src/index.ts`) that exports one factory function:

```typescript
createSlackWebhook(config: SlackWebhookConfig) => WebhookHandler
```

### Request Flow

1. **Slack sends event** → Webhook handler receives HTTP request
2. **Immediate acknowledgment** → Return 200 to Slack within 3 seconds (required)
3. **Event processing** → Extract channel, message, threading info
4. **Deduplication check** → Use `slackIdMap` to prevent duplicate processing
5. **GraphQL mutation** → Call Slashwork API (`createPost` for new messages, `createComment` for thread replies)

### Key Interfaces

- **SlackWebhookConfig**: Configuration with `graphqlEndpoint`, `bearerToken`, `groupMappings`, and optional `slackIdMap`/`getSlackUsername`
- **SlackIdMap**: Pluggable interface for persisting Slack→Slashwork ID mappings (enables threading)
- **SlackWebhookRequest/Response**: Minimal interfaces for framework compatibility (Express, Firebase Functions, etc.)

### Threading Model

- Top-level messages (`ts === thread_ts`): Creates a new Slashwork post
- Thread replies (`ts !== thread_ts`): Creates a comment on the existing post
- Parent post lookup via `slackIdMap.findSlackIdMapping(thread_ts)`

### GraphQL Integration

Direct fetch-based queries to Slashwork API using bearer token auth. Two mutations:
- `createPost(input: { groupId, markdown })` - New posts
- `createComment(input: { postId, markdown })` - Thread replies

## Configuration

Required environment variables (typically):
- `SLASHWORK_API_TOKEN` - Bearer token for Slashwork GraphQL API
- `SLACK_BOT_TOKEN` - For username lookups (if using `getSlackUsername`)

Channel-to-group mapping is done via the `groupMappings` config: `{ [slackChannelId]: slashworkGroupId }`
