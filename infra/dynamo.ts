import { Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class Dynamo extends Construct {
    public readonly tables: { [key: string]: Table } = {};
    constructor(parent: Stack) {
        super(parent, 'TouchieDynamo');

        this.tables['touchie'] = new Table(this, 'TouchieTable', {
            partitionKey: { name: 'pk', type: AttributeType.STRING },
            sortKey: { name: 'sk', type: AttributeType.STRING },
            tableName: 'touchie',
            billingMode: BillingMode.PAY_PER_REQUEST,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
        });
    }
}