import { DISCORD_BASE_URL } from "../contants";

export interface DiscordRequestOptions {
    method?: string;
    headers?: { [key: string]: string };
    body?: any;
}

export class DiscordAdapter {
    private token: string;

    constructor(token: string | undefined) {
        this.token = token || process.env.DISCORD_TOKEN || "";
    }

    async request(path: string, options = {} as DiscordRequestOptions) {
        const url = `${DISCORD_BASE_URL}${path}`;
        const headers = {
            "Authorization": `Bot ${this.token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "User-Agent": "DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)",
            ...(options.headers || {})
        };
        const requestOptions: RequestInit = {
            method: options.method || "GET",
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        };
        console.log(requestOptions)
        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            const data = await response.json();
            console.log(data);
            throw new Error(JSON.stringify(data));
        }

        return response;
    }
}