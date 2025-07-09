export interface Split {
    splitter: string; // ID of the user who initiated the split
    splittie: string; // ID of the user who is receiving the split
    amount: string; // Amount to be split
    timestamp: string; // ISO 8601 timestamp of when the split was created
    confirmation?: string; // Optional confirmation code for the split
    confirmed?: boolean; // Indicates if the split has been confirmed
    createdAt?: string; // ISO 8601 timestamp of when the split was created
}