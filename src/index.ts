import type { EnvelopedEvent } from "@slack/bolt";
import type { SlackEvent } from "@slack/types";

/**
 * Slack URL verification challenge request.
 * Sent when configuring an Events API endpoint.
 */
export interface SlackUrlVerification {
  type: "url_verification";
  token: string;
  challenge: string;
}

/**
 * Union of all possible Slack Events API request payloads.
 */
export type SlackWebhookPayload = SlackUrlVerification | EnvelopedEvent;

/**
 * Minimal request interface compatible with both Express and Firebase v2.
 */
export interface SlackWebhookRequest {
  body: SlackWebhookPayload;
}

/**
 * Minimal response interface compatible with both Express and Firebase v2.
 */
export interface SlackWebhookResponse {
  status(code: number): this;
  send(body?: unknown): this;
  json(body: unknown): this;
}

/**
 * Optional interface for tracking Slack thread IDs to Slashwork post IDs.
 * Enables threaded conversation support.
 */
export interface SlackIdMap {
  saveSlackId(slackId: string, slashworkId: string): void | Promise<void>;
  findSlackIdMapping(
    slackId: string
  ): string | undefined | Promise<string | undefined>;
}

export interface SlackWebhookConfig {
  graphqlEndpoint: string;
  bearerToken: string;
  groupMappings: Record<string, string>; // A map of Slack channel IDs to Slashwork groupIDs.
  slackIdMap?: SlackIdMap; // Optional mapping for threaded conversation support.
  getSlackUsername?: (userId: string) => string | Promise<string>; // Optional function to resolve Slack user IDs to usernames.
}

export type SlackWebhookHandler = (
  req: SlackWebhookRequest,
  res: SlackWebhookResponse
) => void | Promise<void>;

// Re-export useful Slack types for consumers
export type { EnvelopedEvent, SlackEvent };

/**
 * Common input structure shared by createPost and createComment mutations.
 */
interface MessageInput {
  body: string;
}

async function createPost(
  endpoint: string,
  bearerToken: string,
  groupId: string,
  input: MessageInput
): Promise<string | undefined> {
  const mutation = `
    mutation ($groupId: ID!, $input: CreatePostMutationInput!) {
      createPost(groupId: $groupId, input: $input) {
        node { id }
      }
    }
  `;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { groupId, input },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const postId = result.data?.createPost?.node?.id;
  console.log("Created post:", postId);
  return postId;
}

async function createComment(
  endpoint: string,
  bearerToken: string,
  postId: string,
  input: MessageInput
): Promise<void> {
  const mutation = `
    mutation ($postId: ID!, $input: CreateCommentMutationInput!) {
      createComment(postId: $postId, input: $input) {
        node { id }
      }
    }
  `;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { postId, input },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  console.log("Created comment:", result.data?.createComment?.node?.id);
}

export function createSlackWebhook(
  config: SlackWebhookConfig
): SlackWebhookHandler {
  console.log("Creating Slack webhook with config:", {
    graphqlEndpoint: config.graphqlEndpoint,
    bearerToken: "[REDACTED]",
    groupMappings: config.groupMappings,
  });

  return async (req, res) => {
    const payload = req.body;

    // Handle Slack URL verification challenge
    if (payload.type === "url_verification") {
      console.log("Received URL verification challenge");
      res.status(200).json({ challenge: payload.challenge });
      return;
    }

    // At this point, payload is EnvelopedEvent
    const { event, team_id, event_id, event_time } = payload;

    // Log the full Slack event payload
    console.log(
      "Received Slack event:",
      JSON.stringify(
        {
          type: payload.type,
          team_id,
          event_id,
          event_time,
          event,
        },
        null,
        2
      )
    );

    // Acknowledge receipt immediately (Slack expects response within 3 seconds)
    res.status(200).send();

    // Check if event has a channel and if it's mapped
    const channel = (event as { channel?: string }).channel;
    if (!channel) {
      console.log("Event has no channel, skipping");
      res.status(200).send();
      return;
    }

    const groupId = config.groupMappings[channel];
    if (!groupId) {
      console.log(`Channel ${channel} not in group mappings, skipping`);
      res.status(200).send();
      return;
    }

    // Extract message text and threading info from the event
    const text = (event as { text?: string }).text ?? "";
    const ts = (event as { ts?: string }).ts;
    const threadTs = (event as { thread_ts?: string }).thread_ts;
    const userId = (event as { user?: string }).user;

    // Determine if this is a threaded reply (thread_ts exists and differs from ts)
    const isThreadedReply = threadTs && threadTs !== ts;

    // Optionally prefix with username
    let body = text;
    if (config.getSlackUsername && userId) {
      const username = await config.getSlackUsername(userId);

      if (username) {
        body = `[${username}] ${text}`;
      }
    }

    try {
      if (isThreadedReply) {
        if (!config.slackIdMap) {
          console.log(
            "Slack ID map not configured, skipping threaded reply",
            threadTs
          );
          res.status(200).send();
          return;
        }

        // This is a reply to a thread - look up the parent post
        const parentPostId = await config.slackIdMap.findSlackIdMapping(
          threadTs
        );
        if (parentPostId) {
          await createComment(
            config.graphqlEndpoint,
            config.bearerToken,
            parentPostId,
            {
              body,
            }
          );
        } else {
          console.log(
            `No mapping found for thread parent ${threadTs}, skipping comment`
          );
        }
      } else {
        // This is a top-level message - create a post
        const postId = await createPost(
          config.graphqlEndpoint,
          config.bearerToken,
          groupId,
          {
            body,
          }
        );

        // Save the mapping if slackIdMap is configured and we have the necessary IDs
        if (config.slackIdMap && ts && postId) {
          await config.slackIdMap.saveSlackId(ts, postId);
        }
      }
    } catch (error) {
      console.error("Failed to create post/comment:", error);
    }
  };
}
