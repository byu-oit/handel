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
import { expect } from 'chai';
import {
    BindContext,
    PreDeployContext,
    ServiceConfig,
    ServiceContext,
    ServiceType
} from 'handel-extension-api';
import 'mocha';
import * as sinon from 'sinon';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as bindPhase from '../../src/common/bind-phase';
import accountConfig from '../fake-account-config';

describe('bind phases common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext(appName, envName, 'FakeService', new ServiceType('extensionPrefix', 'mysql'), {type: 'mysql'}, accountConfig);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('bindDependentSecurityGroupToSelf', () => {
        it('should add an ssh ingress on the security group', async () => {
            const ownPreDeployContext = new PreDeployContext(serviceContext);
            ownPreDeployContext.securityGroups.push({
                GroupId: 'FakeId'
            });

            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentOfService',
                new ServiceType('extensionPrefix', 'ecs'), {type: 'ecs'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            const addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            const bindContext = await bindPhase.bindDependentSecurityGroup(serviceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 22);
            expect(bindContext).to.be.instanceof(BindContext);
            expect(addIngressRuleToSgIfNotExistsStub.callCount).to.equal(1);
        });
    });
});
