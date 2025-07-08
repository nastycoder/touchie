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