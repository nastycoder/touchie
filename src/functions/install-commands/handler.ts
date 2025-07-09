import { DiscordAdapter } from "../../../lib/adapters/discord";

const { DISCORD_APPLICATION_ID, DISCORD_TOKEN } = process.env;
const discord = new DiscordAdapter(DISCORD_TOKEN);

export const handler = async (event: any): Promise<any> => {
    const commands = [
        {
            name: "ping",
            description: "Replies with Pong!",
            type: 1,
            integration_types: [0, 1],
            contexts: [0, 1, 2],
        },
        {
            name: "split",
            description: "Creates a split entry for a given member",
            type: 1,
            integration_types: [0, 1],
            contexts: [0, 1, 2],
            options: [
                {
                    name: "member",
                    description: "The @username of the member that received the split",
                    type: 6, // USER type
                    required: true,
                },
                {
                    name: "amount",
                    description: "The amount of the split. Format is <number><unit>. Example: 15m = 15 million",
                    type: 3, // STRING type
                    required: true,
                }
            ]
        },
        {
            name: "confirm",
            description: "Confirms a split entry for a given member",
            type: 1,
            integration_types: [0, 1],
            contexts: [0, 1, 2],
            options: [
                {
                    name: "code",
                    description: "The confirmation code for the split",
                    type: 3, // STRING type
                    required: true,
                }
            ]
        }
    ];

    try {
        await Promise.all(commands.map(async command => {
            await discord.request(`/applications/${DISCORD_APPLICATION_ID}/commands`, {
                method: "POST",
                body: command
            });
        }));
    } catch (error) {
        console.error("Error installing commands:", error);
        throw new Error("Failed to install commands");
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Commands installed successfully!"
        })
    };
}