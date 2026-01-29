import { ComprehendClient } from "@aws-sdk/client-comprehend";

export function getComprehendClient() {
  const region = process.env.AWS_REGION || "us-east-1";
  return new ComprehendClient({ region });
}
