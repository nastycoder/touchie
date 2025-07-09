import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { InteractionResponseFlags, InteractionResponseType, InteractionType, MessageComponentTypes, verifyKey } from "discord-interactions";
import { Member } from "../../../lib/models/member";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { Split } from "../../../lib/models/split";

const dynamodb = new DynamoDBClient({});

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

async function textResponse(content: string): Promise<APIGatewayProxyResult> {
    return {
        statusCode: 200,
        body: JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                    {
                        type: MessageComponentTypes.TEXT_DISPLAY,
                        content: content,
                    }
                ]
            },
        }),
    };
}

function convertAmount(option: any): number | null {
    if (!option || !option.value) return null;

    const match = option.value.match(/^(\d+)([a-zA-Z]+)$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    // Convert units to a standard format (e.g., thousand, million, billion)
    switch (unit) {
        case "k":
            return value * 1_000;
        case "m":
            return value * 1_000_000;
        case "b":
            return value * 1_000_000_000;
        default:
            return null; // Unsupported unit
    }
}

async function processSplit(splitter: Member, data: any): Promise<APIGatewayProxyResult> {
    const amount = data.options?.find((option: any) => option.name === "amount");
    const splittie = data.resolved?.users?.[data.options?.find((option: any) => option.name === "member")?.value];

    if (!splitter || !amount || !splittie) {
        return textResponse("Please provide both member and amount options.");
    }

    // Store the split in the database
    const split: Split = {
        splitter: splitter.id,
        splittie: splittie.id,
        amount: `${convertAmount(amount) || 0}`, // Convert amount to a number
        timestamp: new Date().toISOString(),
        // Generate a 4 digit confirmation code
        confirmation: Math.random().toString(36).substring(2, 6),
    };

    // Process the split logic here (e.g., update database, etc.)
    return textResponse(`@${splittie.username} type \`/confirm ${split.confirmation}\` to confirm the ${amount.value} split from @${splitter.username}.`);
}

async function findOrCreateMember(body: any): Promise<Member | null> {
    const userId = body.member?.user?.id;
    const guildId = body.guild_id;
    if (!userId || !guildId) {
        console.error("User ID or Guild ID not found in the request body");
        return null;
    }
    try {
        const params = {
            TableName: process.env.DYNAMO_MEMBERS_TABLE_NAME || "members",
            Key: marshall({ id: userId, guild: guildId }),
        };
        const result = await dynamodb.send(new GetItemCommand(params));
        if (result.Item) {
            return unmarshall(result.Item) as Member;
        } else {
            const newMember = {
                id: userId,
                username: body.member?.user?.username || "Unknown",
                guild: guildId,
                totalSplit: `0`, // Initialize totalSplit to 0
            };
            await dynamodb.send(new PutItemCommand({
                TableName: process.env.DYNAMO_MEMBERS_TABLE_NAME || "members",
                Item: marshall(newMember),
            }));
            return newMember;
        }
    } catch (error) {
        console.error("Error fetching member from database:", error);
        return null;
    }
}

async function processConfirm(member: Member, data: any): Promise<APIGatewayProxyResult> {
    const confirmationCode = data.options?.find((option: any) => option.name === "code");
    if (!confirmationCode || !confirmationCode.value) {
        return textResponse("Please provide a confirmation code.");
    }
    try {
        const params = {
            TableName: process.env.DYNAMO_SPLITS_TABLE_NAME || "splits",
            IndexName: "splittieIndex",
            Key: marshall({
                splittie: member.id,
                confirmation: confirmationCode.value,
            }),
        };
        const result = await dynamodb.send(new GetItemCommand(params));
        if (result.Item) {
            const split = unmarshall(result.Item) as Split;
            split.confirmed = true; // Mark the split as confirmed

            await dynamodb.send(new PutItemCommand({
                TableName: process.env.DYNAMO_SPLITS_TABLE_NAME || "splits",
                Item: marshall(split),
            }));

            const splitter = await findOrCreateMember({
                member: {
                    user: {
                        id: split.splitter
                    }
                },
                guild_id: member.guild
            });
            if (!splitter) {
                return textResponse("Failed to find or create splitter.");
            }

            // Update the totalSplit for the splitter
            splitter.totalSplit = (parseInt(splitter.totalSplit) + parseInt(split.amount)).toString();

            await dynamodb.send(new PutItemCommand({
                TableName: process.env.DYNAMO_MEMBERS_TABLE_NAME || "members",
                Item: marshall(splitter),
            }));

            return textResponse(`Split confirmed for @${member.username}.`);
        } else {
            return textResponse("No split found with the provided confirmation code.");
        }
    } catch (error) {
        console.error("Error confirming split:", error);
        return textResponse("An error occurred while confirming the split.");
    }
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = JSON.parse(event.body || "{}");
    console.log(body);
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

            switch (data.name) {
                case "ping":
                    // Respond to the ping command
                    return textResponse(`Pong!`);
                case "split":
                    const splitter = await findOrCreateMember(body);
                    if (!splitter) {
                        return textResponse("Failed to find or create splitter.");
                    }
                    return processSplit(splitter, body.data);
                case "confirm":
                    const member = await findOrCreateMember(body);
                    if (!member) {
                        return textResponse("Failed to find or create member.");
                    }
                    return processConfirm(member, body.data);
                default:
                    // Handle unknown commands
                    console.log(`Unknown command: ${data.name}`);
                    return textResponse(`Unknown command: ${data.name}`);
            }
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