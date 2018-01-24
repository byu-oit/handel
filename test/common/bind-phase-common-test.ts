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
import * as sinon from 'sinon';
import config from '../../src/account-config/account-config';
import * as ec2Calls from '../../src/aws/ec2-calls';
import * as bindPhaseCommon from '../../src/common/bind-phase-common';
import { AccountConfig, BindContext, PreDeployContext, ServiceConfig, ServiceContext } from '../../src/datatypes';

describe('bind phases common module', () => {
    let sandbox: sinon.SinonSandbox;
    let serviceContext: ServiceContext<ServiceConfig>;
    let accountConfig: AccountConfig;
    const appName = 'FakeApp';
    const envName = 'FakeEnv';

    beforeEach(async () => {
        const retAccountConfig = await config(`${__dirname}/../test-account-config.yml`)
        sandbox = sinon.sandbox.create();
        serviceContext = new ServiceContext(appName, envName, 'FakeService', 'mysql', {type: 'mysql'}, retAccountConfig);
        accountConfig = retAccountConfig;
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

            const dependentOfServiceContext = new ServiceContext(appName, envName, 'FakeDependentOfService', 'ecs', {type: 'ecs'}, accountConfig);
            const dependentOfPreDeployContext = new PreDeployContext(dependentOfServiceContext);
            dependentOfPreDeployContext.securityGroups.push({
                GroupId: 'OtherId'
            });

            const addIngressRuleToSgIfNotExistsStub = sandbox.stub(ec2Calls, 'addIngressRuleToSgIfNotExists').returns(Promise.resolve({}));

            const bindContext = await bindPhaseCommon.bindDependentSecurityGroupToSelf(serviceContext, ownPreDeployContext, dependentOfServiceContext, dependentOfPreDeployContext, 'tcp', 22, 'FakeService');
            expect(bindContext).to.be.instanceof(BindContext);
            expect(addIngressRuleToSgIfNotExistsStub.callCount).to.equal(1);
        });
    });
});
