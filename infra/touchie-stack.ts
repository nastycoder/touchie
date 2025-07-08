import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Dynamo } from './dynamo';
import { Lambda } from './lambda';
import { Api } from './api';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

export class TouchieStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const dynamo = new Dynamo(this);
        const lambda = new Lambda(this, dynamo);
        const api = new Api(this);

        const botResource = api.gateway.root.addResource('bot');
        botResource.addMethod(
            'POST',
            new LambdaIntegration(lambda.functions['bot']),
        );
    }
}
