import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { InteractionResponseFlags, InteractionResponseType, InteractionType, MessageComponentTypes, verifyKey } from "discord-interactions";
import { Member } from "../../../lib/models/member";
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, QueryCommandInput, ScanCommand, ScanCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { Split } from "../../../lib/models/split";
import { helpText } from "./help-text";

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

async function textResponseWithMentions(content: string, userIds: string[]): Promise<APIGatewayProxyResult> {
    const body = {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
                {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: content,
                    allowed_mentions: {
                        parse: ["users"],
                        users: userIds,
                    },
                }
            ]
        },
    };
    return {
        statusCode: 200,
        body: JSON.stringify(body),
    };
}

function encodeAmount(amount: string): string {
    const value = parseInt(amount, 10);
    if (isNaN(value)) return "0";
    if (value >= 1_000_000_000) return `${Math.floor(value / 1_000_000_000)}b`;
    if (value >= 1_000_000) return `${Math.floor(value / 1_000_000)}m`;
    if (value >= 1_000) return `${Math.floor(value / 1_000)}k`;
    return `${value}`;
}

function decodeAmount(option: any): number | null {
    if (!option || !option.value) return null;

    const match = option.value.match(/^(\d+)([a-zA-Z]+)$/);
    if (!match) return null;

    const value = parseFloat(match[1]);
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

    if (splitter.id === splittie.id) {
        return textResponseWithMentions(`You cannot split with yourself. <@${splitter.id}> is a 🤡`, [splitter.id]);
    }

    // Store the split in the database
    const split: Split = {
        splitter: splitter.id,
        splittie: splittie.id,
        amount: `${decodeAmount(amount) || 0}`, // Convert amount to a number
        timestamp: new Date().toISOString(),
        // Generate a 4 digit confirmation code
        confirmation: Math.random().toString(36).substring(2, 6),
        confirmed: false,
    };

    await dynamodb.send(new PutItemCommand({
        TableName: process.env.DYNAMO_SPLITS_TABLE_NAME || "splits",
        Item: marshall(split),
    }));

    // Process the split logic here (e.g., update database, etc.)
    return textResponseWithMentions(
        `<@${splittie.id}> type \`/confirm ${split.confirmation}\` to confirm the ${amount.value} split from <@${splitter.id}>.`,
        [splittie.id, splitter.id]
    );
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
            KeyConditionExpression: "splittie = :splittie AND confirmation = :confirmation",
            ExpressionAttributeValues: marshall({
                ":splittie": member.id,
                ":confirmation": confirmationCode.value,
            }),
            Limit: 1, // We only need one split to confirm
        } as QueryCommandInput;

        const result = await dynamodb.send(new QueryCommand(params));
        if (result.Items && result.Items.length > 0) {
            const split = unmarshall(result.Items[0]) as Split;
            if (split.confirmed) {
                return textResponse("This split has already been confirmed.");
            }
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

            return textResponseWithMentions(`Split confirmed for <@${member.id}>.`, [member.id]);
        } else {
            return textResponse("No split found with the provided confirmation code.");
        }
    } catch (error) {
        console.error("Error confirming split:", error);
        return textResponse("An error occurred while confirming the split.");
    }
}

async function printBoard(guildId: string): Promise<APIGatewayProxyResult> {
    try {
        const params = {
            TableName: process.env.DYNAMO_MEMBERS_TABLE_NAME || "members",
            IndexName: "guildIndex",
            ProjectionExpression: "username, totalSplit",
            KeyConditionExpression: "guild = :guildId",
            ExpressionAttributeValues: marshall({
                ":guildId": guildId,
            }),
        } as QueryCommandInput;
        const members: Member[] = [];
        let nextToken: Record<string, any> | undefined = undefined;
        do {
            params.ExclusiveStartKey = nextToken;
            const result = await dynamodb.send(new QueryCommand(params));
            if (result.Items) {
                members.push(...result.Items.map(item => unmarshall(item) as Member));
            }
            nextToken = result.LastEvaluatedKey ? result.LastEvaluatedKey : undefined;
        } while (nextToken);

        let nameLength = "Member".length;
        let totalLength = "Total Split".length;

        members.forEach(member => {
            nameLength = Math.max(nameLength, member.username.length);
            totalLength = Math.max(totalLength, member.totalSplit.length);
        });

        let markdown = "```markdown\n# Touchie Board\n\n";
        markdown += `| ${"Member".padEnd(nameLength)} | ${"Total Split".padEnd(totalLength)} |\n`;
        markdown += `| ${"-".repeat(nameLength)} | ${"-".repeat(totalLength)} |\n`;
        const sorted = members.sort((a, b) => parseInt(b.totalSplit) - parseInt(a.totalSplit));
        sorted.forEach(member => {
            markdown += `| ${member.username.padEnd(nameLength)} | ${encodeAmount(member.totalSplit).padEnd(totalLength)} |\n`;
        });
        markdown += "```";

        return textResponse(markdown);
    } catch (error) {
        console.error("Error printing board:", error);
        return textResponse("An error occurred while printing the board.");
    }
}

async function printHelp(): Promise<APIGatewayProxyResult> {
    return textResponse(helpText);
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
                case "board":
                    return printBoard(body.guild_id);
                case "help":
                    return printHelp();
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