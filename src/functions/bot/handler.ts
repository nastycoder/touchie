import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { InteractionResponseFlags, InteractionResponseType, InteractionType, MessageComponentTypes, verifyKey } from "discord-interactions";

async function verifyRequest(headers: APIGatewayProxyEvent["headers"], body: string | null): Promise<boolean> {
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

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log(event);
    const body = JSON.parse(event.body || "{}");

    if (!(await verifyRequest(event.headers, event.body))) {
        console.log("Request verification failed");
        return {
            statusCode: 401,
            body: JSON.stringify({
                message: "Unauthorized",
            }),
        };
    }
    const { id, type, data } = body;

    switch (type) {
        case InteractionType.PING:
            // Respond to a ping interaction
            return {
                statusCode: 200,
                body: JSON.stringify({
                    type: InteractionResponseType.PONG,
                }),
            };
        case InteractionType.APPLICATION_COMMAND:
            // Handle application command interaction
            console.log(data);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                        components: [
                            {
                                type: MessageComponentTypes.TEXT_DISPLAY,
                                content: "Pong!",
                            }
                        ]
                    },
                }),
            };
        default:
            // Handle other interaction types if necessary
            console.log(`Unhandled interaction type: ${type}`);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Unhandled interaction type",
                }),
            };
    }
};