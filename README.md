# slack-to-slashwork
A web request handler that pushes new messages from Slack channels into Slashwork groups. The
request handler expects to be called by Slack's Event Subscriptions API, and uses Slashwork's
GraphQL service to mirror new messages in designated Slack channels into Slashwork groups.

(if firebase, enable unauth'd access)
