import { TextractClient } from "@aws-sdk/client-textract";

export function getTextractClient() {
  const region = process.env.AWS_REGION || "us-east-1";
  return new TextractClient({ region });
}
