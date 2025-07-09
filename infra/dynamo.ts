import { Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class Dynamo extends Construct {
    public readonly tables: { [key: string]: Table } = {};
    constructor(parent: Stack) {
        super(parent, 'TouchieDynamo');

        this.tables['members'] = new Table(this, 'MembersTable', {
            partitionKey: { name: 'id', type: AttributeType.STRING },
            sortKey: { name: 'guild', type: AttributeType.STRING },
            tableName: 'members',
            billingMode: BillingMode.PAY_PER_REQUEST,
        });

        this.tables['members'].addGlobalSecondaryIndex({
            indexName: 'guildIndex',
            partitionKey: { name: 'guild', type: AttributeType.STRING }
        });

        this.tables['members'].addGlobalSecondaryIndex({
            indexName: 'splitIndex',
            partitionKey: { name: 'id', type: AttributeType.STRING },
            sortKey: { name: 'totalSplit', type: AttributeType.STRING },
        });

        this.tables['splits'] = new Table(this, 'SplitsTable', {
            partitionKey: { name: 'splitter', type: AttributeType.STRING },
            sortKey: { name: 'timestamp', type: AttributeType.STRING },
            tableName: 'splits',
            billingMode: BillingMode.PAY_PER_REQUEST,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
        });

        this.tables['splits'].addGlobalSecondaryIndex({
            indexName: 'splittieIndex',
            partitionKey: { name: 'splittie', type: AttributeType.STRING },
            sortKey: { name: 'confirmation', type: AttributeType.STRING },
        });
    }
}