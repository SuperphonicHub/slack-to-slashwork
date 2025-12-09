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

export interface SlackWebhookConfig {
  graphqlEndpoint: string;
  bearerToken: string;
  groupMappings: Record<string, string>; // A map of Slack channel IDs to Slashwork groupIDs.
}

export type SlackWebhookHandler = (
  req: SlackWebhookRequest,
  res: SlackWebhookResponse
) => void | Promise<void>;

// Re-export useful Slack types for consumers
export type { EnvelopedEvent, SlackEvent };

export function createSlackWebhook(
  config: SlackWebhookConfig
): SlackWebhookHandler {
  console.log("Creating Slack webhook with config:", {
    graphqlEndpoint: config.graphqlEndpoint,
    bearerToken: "[REDACTED]",
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
  };
}
