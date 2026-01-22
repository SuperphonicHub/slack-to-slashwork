import type { EnvelopedEvent } from "@slack/bolt";
import type { SlackEvent, MessageAttachment, KnownBlock, Block } from "@slack/types";

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
  markdown: string;
}

/**
 * Converts a single Slack attachment to markdown format.
 */
function attachmentToMarkdown(attachment: MessageAttachment): string {
  const parts: string[] = [];

  // Pretext appears above the attachment
  if (attachment.pretext) {
    parts.push(attachment.pretext);
  }

  // Author info
  if (attachment.author_name) {
    if (attachment.author_link) {
      parts.push(`*[${attachment.author_name}](${attachment.author_link})*`);
    } else {
      parts.push(`*${attachment.author_name}*`);
    }
  }

  // Title with optional link
  if (attachment.title) {
    if (attachment.title_link) {
      parts.push(`**[${attachment.title}](${attachment.title_link})**`);
    } else {
      parts.push(`**${attachment.title}**`);
    }
  }

  // Main text body
  if (attachment.text) {
    parts.push(attachment.text);
  }

  // Fields (often used for log samples, key-value data, etc.)
  if (attachment.fields && attachment.fields.length > 0) {
    const fieldLines = attachment.fields.map((field) => {
      if (field.title && field.value) {
        return `**${field.title}:** ${field.value}`;
      } else if (field.value) {
        return field.value;
      } else if (field.title) {
        return `**${field.title}**`;
      }
      return "";
    });
    parts.push(fieldLines.filter(Boolean).join("\n"));
  }

  // Footer
  if (attachment.footer) {
    parts.push(`_${attachment.footer}_`);
  }

  // Fallback as last resort if nothing else captured content
  if (parts.length === 0 && attachment.fallback) {
    parts.push(attachment.fallback);
  }

  return parts.join("\n\n");
}

/**
 * Converts an array of Slack attachments to markdown.
 */
function attachmentsToMarkdown(attachments: MessageAttachment[]): string {
  return attachments
    .map((attachment) => attachmentToMarkdown(attachment))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Extracts text content from a TextObject (plain_text or mrkdwn).
 */
function textObjectToString(
  textObj: { type: string; text: string } | undefined
): string {
  return textObj?.text ?? "";
}

/**
 * Converts a single Slack block to markdown format.
 * Handles the most common block types used in messages.
 */
function blockToMarkdown(block: KnownBlock | Block): string {
  // Type guard to check if block has a known type
  const blockType = block.type;

  switch (blockType) {
    case "section": {
      const sectionBlock = block as {
        type: "section";
        text?: { type: string; text: string };
        fields?: { type: string; text: string }[];
      };
      const parts: string[] = [];

      if (sectionBlock.text) {
        parts.push(textObjectToString(sectionBlock.text));
      }

      if (sectionBlock.fields && sectionBlock.fields.length > 0) {
        const fieldTexts = sectionBlock.fields.map((f) =>
          textObjectToString(f)
        );
        parts.push(fieldTexts.filter(Boolean).join("\n"));
      }

      return parts.join("\n\n");
    }

    case "header": {
      const headerBlock = block as {
        type: "header";
        text: { type: string; text: string };
      };
      return `## ${textObjectToString(headerBlock.text)}`;
    }

    case "context": {
      const contextBlock = block as {
        type: "context";
        elements: Array<{ type: string; text?: string; alt_text?: string }>;
      };
      const contextParts = contextBlock.elements
        .map((el) => {
          if (el.type === "image") {
            return el.alt_text ?? "";
          }
          return (el as { text?: string }).text ?? "";
        })
        .filter(Boolean);
      return `_${contextParts.join(" | ")}_`;
    }

    case "divider":
      return "---";

    case "markdown": {
      const markdownBlock = block as { type: "markdown"; text: string };
      return markdownBlock.text ?? "";
    }

    case "rich_text": {
      // Rich text blocks contain complex nested structure
      // Extract text from rich_text_section elements
      const richTextBlock = block as {
        type: "rich_text";
        elements: Array<{
          type: string;
          elements?: Array<{ type: string; text?: string }>;
        }>;
      };
      const textParts: string[] = [];

      for (const element of richTextBlock.elements ?? []) {
        if (element.type === "rich_text_section" && element.elements) {
          const sectionText = element.elements
            .map((el) => {
              if (el.type === "text") return el.text ?? "";
              if (el.type === "link")
                return (el as { url?: string }).url ?? el.text ?? "";
              return el.text ?? "";
            })
            .join("");
          textParts.push(sectionText);
        } else if (element.type === "rich_text_preformatted" && element.elements) {
          const preText = element.elements.map((el) => el.text ?? "").join("");
          textParts.push("```\n" + preText + "\n```");
        } else if (element.type === "rich_text_quote" && element.elements) {
          const quoteText = element.elements.map((el) => el.text ?? "").join("");
          textParts.push("> " + quoteText);
        } else if (element.type === "rich_text_list" && element.elements) {
          // Handle list items
          const listElement = element as {
            type: string;
            style?: string;
            elements?: Array<{
              type: string;
              elements?: Array<{ type: string; text?: string }>;
            }>;
          };
          const listItems = (listElement.elements ?? []).map((item, index) => {
            const itemText = (item.elements ?? [])
              .map((el) => el.text ?? "")
              .join("");
            const prefix = listElement.style === "ordered" ? `${index + 1}. ` : "- ";
            return prefix + itemText;
          });
          textParts.push(listItems.join("\n"));
        }
      }

      return textParts.join("\n");
    }

    case "image": {
      const imageBlock = block as {
        type: "image";
        alt_text: string;
        title?: { type: string; text: string };
        image_url?: string;
      };
      const altText = imageBlock.alt_text ?? "image";
      const title = imageBlock.title ? textObjectToString(imageBlock.title) : altText;
      if (imageBlock.image_url) {
        return `![${title}](${imageBlock.image_url})`;
      }
      return `[Image: ${title}]`;
    }

    default:
      // For unknown block types, return empty string
      return "";
  }
}

/**
 * Converts an array of Slack blocks to markdown.
 */
function blocksToMarkdown(blocks: (KnownBlock | Block)[]): string {
  return blocks
    .map((block) => blockToMarkdown(block))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Builds the full markdown content from a Slack message event,
 * including the main text, attachments, and blocks.
 */
function buildFullMarkdown(
  text: string,
  attachments?: MessageAttachment[],
  blocks?: (KnownBlock | Block)[]
): string {
  const parts: string[] = [];

  // Main message text
  if (text) {
    parts.push(text);
  }

  // Convert blocks to markdown (newer format)
  if (blocks && blocks.length > 0) {
    const blocksMarkdown = blocksToMarkdown(blocks);
    if (blocksMarkdown) {
      parts.push(blocksMarkdown);
    }
  }

  // Convert attachments to markdown (legacy format, but still used by DataDog, etc.)
  if (attachments && attachments.length > 0) {
    const attachmentsMarkdown = attachmentsToMarkdown(attachments);
    if (attachmentsMarkdown) {
      parts.push(attachmentsMarkdown);
    }
  }

  return parts.join("\n\n");
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
): Promise<string | undefined> {
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
  return result.data?.createComment?.node?.id;
}

export function createSlackWebhook(
  config: SlackWebhookConfig
): SlackWebhookHandler {
  return async (req, res) => {
    const payload = req.body;

    // Handle Slack URL verification challenge
    if (payload.type === "url_verification") {
      console.log("Received URL verification challenge");
      res.status(200).json({ challenge: payload.challenge });
      return;
    }

    // At this point, payload is EnvelopedEvent
    const { event } = payload;

    // Acknowledge receipt immediately (Slack expects response within 3 seconds)
    res.status(200).send();

    // Check if event has a channel and if it's mapped
    const channel = (event as { channel?: string }).channel;
    if (!channel) {
      console.log("Event has no channel, skipping", event);
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
    const attachments = (event as { attachments?: MessageAttachment[] })
      .attachments;
    const blocks = (event as { blocks?: (KnownBlock | Block)[] }).blocks;

    // Determine if this is a threaded reply (thread_ts exists and differs from ts)
    const isThreadedReply = threadTs && threadTs !== ts;

    // Build full markdown including attachments and blocks
    let markdown = buildFullMarkdown(text, attachments, blocks);
    if (config.getSlackUsername && userId) {
      const username = await config.getSlackUsername(userId);

      if (username) {
        markdown = `[${username}] ${markdown}`;
      }
    }

    if (!ts) {
      console.error("Event has thread id, skipping", event);
      res.status(400).send();
      return;
    }

    const threadIdToDedupe = isThreadedReply ? threadTs : ts;
    const previousSlashId = await config.slackIdMap?.findSlackIdMapping(
      threadIdToDedupe
    );
    if (previousSlashId) {
      console.log("Previous slash id found, skipping", previousSlashId, event);
      res.status(200).send();
      return;
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
          const commentId = await createComment(
            config.graphqlEndpoint,
            config.bearerToken,
            parentPostId,
            {
              markdown,
            }
          );
          if (commentId) {
            await config.slackIdMap.saveSlackId(threadTs, commentId);
          }
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
            markdown,
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
