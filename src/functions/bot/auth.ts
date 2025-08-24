import { APIGatewayProxyEvent } from "aws-lambda";
import { verifyKey } from "discord-interactions";

export async function verifyRequest(headers: APIGatewayProxyEvent["headers"], body: string | null): Promise<boolean> {
    if (!headers || !headers["x-signature-ed25519"] || !headers["x-signature-timestamp"]) {
        console.error("Missing required headers for verification");
        return false;
    }

    return verifyKey(
        body || "",
        headers["x-signature-ed25519"],
        headers["x-signature-timestamp"],
        process.env.DISCORD_PUBLIC_KEY || ""
    );
}