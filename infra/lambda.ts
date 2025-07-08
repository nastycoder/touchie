import { Duration, Stack } from "aws-cdk-lib";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { Dirent, readdirSync, readFileSync } from "fs";
import path = require("path");
import { Dynamo } from "./dynamo";

export class Lambda extends Construct {
    public readonly functions: { [key: string]: Function } = {};
    private readonly dynamo: Dynamo;

    constructor(parent: Stack, dynamo: Dynamo) {
        super(parent, "TouchieLambdas");
        this.dynamo = dynamo;
        readdirSync(
            path.join(__dirname, '..', 'src', 'functions'),
            { withFileTypes: true }
        ).filter((dir) => dir.isDirectory()).forEach((dir) => {
            this.functions[dir.name] = this.createFunction(dir);
        });
    }

    private createFunction(dir: Dirent): Function {
        const file = JSON.parse(
            readFileSync(
                path.join(__dirname, '..', 'src', 'functions', dir.name, 'env.json'),
                { encoding: 'utf-8' }
            )
        ) as { vars: string[] };

        const env: { [key: string]: string } = {};

        (file.vars || []).forEach((key) => {
            switch (key) {
                case 'DYNAMO_TOUCHIE_TABLE_NAME':
                    env[key] = this.dynamo.tables['touchie'].tableName;
                    break;
                default:
                    env[key] = process.env[key] || "not-set";
            }
        });

        return new NodejsFunction(this, `${dir.name}`, {
            functionName: dir.name,
            entry: path.join(__dirname, '..', 'src', 'functions', dir.name, 'handler.ts'),
            handler: 'handler',
            runtime: Runtime.NODEJS_22_X,
            timeout: Duration.seconds(900),
            bundling: {
                externalModules: ['aws-sdk'],
                minify: false,
            },
            environment: env
        });
    }
}