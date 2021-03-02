/*
 * Copyright 2018 Brigham Young University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { Tags } from 'handel-extension-api';
import { awsCalls, deployPhase, handlebars, util } from 'handel-extension-support';
import * as types from './config-types';
import { CapacityMode, DEFAULT_CAPACITY_MODE } from './config-types';

/* tslint:disable:max-classes-per-file */

const enum ScalingTypes {
    READ,
    WRITE
}

const LogicalIdSuffixes = {
    [ScalingTypes.READ]: 'Read',
    [ScalingTypes.WRITE]: 'Write'
};

const enum ScalingTargetTypes {
    TABLE = 'table',
    INDEX = 'index'
}

const ScalingDimensionUnits = {
    [ScalingTypes.READ]: 'ReadCapacityUnits',
    [ScalingTypes.WRITE]: 'WriteCapacityUnits'
};

const ScalingMetricTypes = {
    [ScalingTypes.READ]: 'DynamoDBReadCapacityUtilization',
    [ScalingTypes.WRITE]: 'DynamoDBWriteCapacityUtilization'
};

const DEFAULT_CAPACITY_UNITS = 1;
const DEFAULT_AUTOSCALING_TARGET_UTILIZATION = 70;
const VALID_THROUGHPUT_PATTERN = /^(\d+)(?:-(\d+))?$/;

export function deployAutoscaling(
    tableName: string,
    ownServiceContext: types.DynamoDBContext,
    serviceName: string,
    stackTags: Tags
): Promise<any> {
    if (!tableOrIndexesHaveAutoscaling(ownServiceContext)) {
        return Promise.resolve();
    }
    return getCompiledAutoscalingTemplate(tableName, ownServiceContext)
        .then((compiledTemplate: string) => {
            const stackName = getAutoscalingStackName(ownServiceContext);
            return deployPhase.deployCloudFormationStack(
                ownServiceContext, stackName, compiledTemplate, [], true, 30, stackTags
            );
        });
}

export async function undeployAutoscaling(ownServiceContext: types.DynamoDBContext) {
    const stackName = getAutoscalingStackName(ownServiceContext);
    const stack = await awsCalls.cloudFormation.getStack(stackName);
    if (stack) {
        return awsCalls.cloudFormation.deleteStack(stackName);
    }
}

export function getThroughputConfig(
    throughputConfig: types.ProvisionedThroughput | undefined,
    defaultConfig: ThroughputConfig | null
): ThroughputConfig {
    const throughput = throughputConfig || {};
    const defaults = defaultConfig || {} as ThroughputConfig;
    const defaultRead = defaults.read || {};
    const defaultWrite = defaults.write || {};

    const read = assembleThroughputConfig(
        throughput.read_capacity_units,
        throughput.read_target_utilization,
        defaultRead
    );

    const write = assembleThroughputConfig(
        throughput.write_capacity_units,
        throughput.write_target_utilization,
        defaultWrite
    );

    return { read, write };
}

function isValidTargetUtilization(target: number): boolean {
    return target > 0 && target <= 100;
}

function tableOrIndexesHaveAutoscaling(ownServiceContext: types.DynamoDBContext): boolean {
    const params = ownServiceContext.params;
    if ((params.capacity_mode || DEFAULT_CAPACITY_MODE) === CapacityMode.ON_DEMAND) {
        return false;
    }
    if (params.provisioned_throughput) {
        if (provisionedThroughputHasAutoscaling(params.provisioned_throughput)) {
            return true;
        }
    }

    if (params.global_indexes) {
        return params.global_indexes
            .some((idx: any) => provisionedThroughputHasAutoscaling(idx.provisioned_throughput));
    }

    return false;
}

function getAutoscalingStackName(ownServiceContext: types.DynamoDBContext) {
    return ownServiceContext.stackName() + '-autoscaling';
}

function getCompiledAutoscalingTemplate(tableName: string, ownServiceContext: types.DynamoDBContext): Promise<string> {
    const serviceParams = ownServiceContext.params;
    const accountConfig = ownServiceContext.accountConfig;

    const handlebarsParams: any = {
        tableName,
        targets: getScalingTargets(serviceParams, tableName)
    };

    if (accountConfig.permissions_boundary) {
        handlebarsParams.permissionsBoundary = accountConfig.permissions_boundary
    }

    return handlebars.compileTemplate(`${__dirname}/dynamodb-autoscaling-template.yml`, handlebarsParams);
}

function getScalingTargets(serviceParams: types.DynamoDBConfig, tableName: string) {
    const configs = [];

    const tableThroughput = getThroughputConfig(serviceParams.provisioned_throughput, null);

    configs.push(...extractScalingTargets(tableThroughput, ScalingTargetTypes.TABLE, 'Table', 'table/' + tableName));

    if (serviceParams.global_indexes) {
        const indexConfigs = serviceParams.global_indexes
            .map(config => {
                const throughput = getThroughputConfig(config.provisioned_throughput, tableThroughput);
                const idxName = config.name;
                return extractScalingTargets(
                    throughput,
                    ScalingTargetTypes.INDEX,
                    'Index' + util.normalizeLogicalId(idxName),
                    'table/' + tableName + '/index/' + idxName
                );
            }).reduce((acc, cur) => {
                return acc.concat(cur);
            }, []);
        configs.push(...indexConfigs);
    }

    configs.forEach((each, idx, array) => {
        if (idx === 0) {
            return;
        }
        const prev = array[idx - 1];
        each.dependsOn = prev.logicalIdPrefix;
    });

    return configs;
}

export interface ThroughputConfig {
    read: ThroughputCapacity;
    write: ThroughputCapacity;
}

function assembleThroughputConfig(capacity: string | number | undefined,
    targetUtilization: number | undefined,
    defaultConfig: ThroughputCapacity): ThroughputCapacity {
    const result = {} as ThroughputCapacity;
    if (capacity) {
        Object.assign(result, parseThroughputCapacity(capacity));
        result.target = targetUtilization || defaultConfig.target || DEFAULT_AUTOSCALING_TARGET_UTILIZATION;
    } else {
        Object.assign(
            result,
            { initial: DEFAULT_CAPACITY_UNITS, target: DEFAULT_AUTOSCALING_TARGET_UTILIZATION, scaled: false },
            defaultConfig
        );
    }
    return result;
}

function provisionedThroughputHasAutoscaling(provisionedThroughput: types.ProvisionedThroughput): boolean {
    if (!provisionedThroughput) {
        return false;
    }
    const read = parseThroughputCapacity(provisionedThroughput.read_capacity_units);
    const write = parseThroughputCapacity(provisionedThroughput.write_capacity_units);

    return read.scaled || write.scaled;
}

function parseThroughputCapacity(capacity: string | number | undefined): ThroughputCapacity {
    if (!capacity) {
        return new ThroughputCapacity(false);
    }
    const result = VALID_THROUGHPUT_PATTERN.exec(capacity as string);
    if (!result) {
        return new ThroughputCapacity(false, capacity);
    }
    const [, min, max] = result;
    if (!max) {
        return new ThroughputCapacity(false, capacity);
    }
    return new ThroughputCapacity(true, min, min, max);
}

function extractScalingTargets(throughputConfig: ThroughputConfig,
    targetType: ScalingTargetTypes,
    logicalIdPrefix: string,
    resourceId: string) {
    const configs = [];
    if (throughputConfig.read.scaled) {
        configs.push(
            getScalingConfig(throughputConfig.read, ScalingTypes.READ, logicalIdPrefix, targetType, resourceId)
        );
    }
    if (throughputConfig.write.scaled) {
        configs.push(
            getScalingConfig(throughputConfig.write, ScalingTypes.WRITE, logicalIdPrefix, targetType, resourceId)
        );
    }
    return configs;
}

function getScalingConfig(config: ThroughputCapacity,
    scalingType: ScalingTypes,
    logicalIdPrefix: string,
    targetType: ScalingTargetTypes,
    resourceId: string) {
    return new AutoscalingDefinition(
        logicalIdPrefix + LogicalIdSuffixes[scalingType],
        config.min,
        config.max,
        config.target,
        targetType + ':' + ScalingDimensionUnits[scalingType],
        ScalingMetricTypes[scalingType],
        resourceId
    );
}

export class ThroughputCapacity {

    public target!: number;

    public readonly initial: number;
    public readonly min: number;
    public readonly max: number;

    constructor(readonly scaled: boolean,
        initial: number | string = DEFAULT_CAPACITY_UNITS,
        min: number | string = DEFAULT_CAPACITY_UNITS,
        max: number | string = DEFAULT_CAPACITY_UNITS) {
        this.initial = Number(initial);
        this.min = Number(min);
        this.max = Number(max);
    }
}

export class AutoscalingDefinition {

    public dependsOn!: string;
    public readonly min: number;
    public readonly max: number;
    public readonly target: number;

    constructor(readonly logicalIdPrefix: string,
        min: number | string,
        max: number | string,
        target: number | string,
        readonly dimension: string,
        readonly metric: string,
        readonly resourceId: string) {
        this.min = Number(min);
        this.max = Number(max);
        this.target = Number(target);
    }
}
