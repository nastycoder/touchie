import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { RestApi } from "aws-cdk-lib/aws-apigateway";

export class Api extends Construct {
    public readonly gateway: RestApi;

    constructor(parent: Stack) {
        super(parent, 'TouchieApi');

        const role = new Role(this, 'ApiRole', {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
        });

        this.gateway = new RestApi(this, 'TouchieApi', {
            restApiName: 'Touchie API',
            deployOptions: {
                stageName: 'v1',
                metricsEnabled: true,
                dataTraceEnabled: true
            }
        });
    }
}