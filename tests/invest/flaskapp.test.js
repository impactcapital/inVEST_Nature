import fs from 'fs';

import readline from 'readline';
import fetch from 'node-fetch';
import React from 'react';
import { render } from '@testing-library/react';

import * as server_requests from '../../src/renderer/server_requests';
import { argsDictFromObject } from '../../src/renderer/utils';
import SetupTab from '../../src/renderer/components/SetupTab';
import {
  createPythonFlaskProcess,
  shutdownPythonProcess,
  getFlaskIsReady,
} from '../../src/main/createPythonFlaskProcess';
import findInvestBinaries from '../../src/main/findInvestBinaries';

// This could be optionally configured already in '.env'
if (!process.env.PORT) {
  process.env.PORT = 56788;
}

jest.setTimeout(250000); // This test is slow in CI
global.window.fetch = fetch;
beforeAll(async () => {
  const isDevMode = true; // otherwise need to mock process.resourcesPath
  const investExe = findInvestBinaries(isDevMode);
  createPythonFlaskProcess(investExe);
  // In the CI the flask app takes more than 10x as long to startup.
  // Especially so on macos.
  // So, allowing many retries, especially because the error
  // that is thrown if all retries fail is swallowed by jest
  // and tests try to run anyway.
  await getFlaskIsReady({ retries: 201 });
});

afterAll(async () => {
  await shutdownPythonProcess();
});

test('invest list items have expected properties', async () => {
  const investList = await server_requests.getInvestModelNames();
  Object.values(investList).forEach((item) => {
    expect(item.internal_name).not.toBeUndefined();
  });
});

test('fetch invest model args spec', async () => {
  const spec = await server_requests.getSpec('carbon');
  const expectedKeys = ['model_name', 'module', 'userguide_html', 'args'];
  expectedKeys.forEach((key) => {
    expect(spec[key]).not.toBeUndefined();
  });
});

test('fetch invest validation', async () => {
  const spec = await server_requests.getSpec('carbon');
  // it's okay to validate even if none of the args have values yet
  const argsDict = argsDictFromObject(spec.args);
  const payload = {
    model_module: spec.module,
    args: JSON.stringify(argsDict),
  };

  const results = await server_requests.fetchValidation(payload);
  // There's always an array of arrays, where each child array has
  // two elements: 1) an array of invest arg keys, 2) string message
  expect(results[0]).toHaveLength(2);
});

test('write parameters to file and parse them from file', async () => {
  const spec = await server_requests.getSpec('carbon');
  const argsDict = argsDictFromObject(spec.args);
  const filepath = 'tests/data/foo.json';
  const payload = {
    parameterSetPath: filepath,
    moduleName: spec.module,
    args: JSON.stringify(argsDict),
    relativePaths: true,
  };

  // First test the data is written
  await server_requests.writeParametersToFile(payload);
  const data = JSON.parse(fs.readFileSync(filepath));
  const expectedKeys = [
    'args',
    'invest_version',
    'model_name'
  ];
  expectedKeys.forEach((key) => {
    expect(data[key]).not.toBeUndefined();
  });

  // Second test the datastack is read and parsed
  const data2 = await server_requests.fetchDatastackFromFile(filepath);
  const expectedKeys2 = [
    'type',
    'args',
    'invest_version',
    'module_name',
    'model_run_name',
    'model_human_name',
  ];
  expectedKeys2.forEach((key) => {
    expect(data2[key]).not.toBeUndefined();
  });
  fs.unlinkSync(filepath);
});

test('write parameters to python script', async () => {
  const modelName = 'carbon'; // as appearing in `invest list`
  const spec = await server_requests.getSpec(modelName);
  const argsDict = argsDictFromObject(spec.args);
  const filepath = 'tests/data/foo.py';
  const payload = {
    filepath: filepath,
    modelname: modelName,
    pyname: spec.module,
    args: JSON.stringify(argsDict),
  };
  await server_requests.saveToPython(payload);

  const file = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity,
  });
  // eslint-disable-next-line
  for await (const line of file) {
    expect(`${line}`).toBe('# coding=UTF-8');
    break;
  }
  fs.unlinkSync(filepath);
});

test('validate the UI spec', async () => {
  const uiSpec = require('../../src/renderer/ui_config');
  const models = await server_requests.getInvestModelNames();
  const modelInternalNames = Object.keys(models)
    .map((key) => models[key].internal_name);
  // get the args spec for each model
  const argsSpecs = await Promise.all(modelInternalNames.map(
    (model) => server_requests.getSpec(model)
  ));

  argsSpecs.forEach((spec, idx) => {
    const modelName = modelInternalNames[idx];
    // make sure that we actually got an args spec
    expect(spec.model_name).toBeDefined();
    let hasOrderProperty = false;
    // expect the model's spec has an entry in the UI spec.
    expect(Object.keys(uiSpec)).toContain(modelName);
    // expect each arg in the UI spec to exist in the args spec
    for (const property in uiSpec[modelName]) {
      if (property === 'order') {
        hasOrderProperty = true;
        // 'order' is a 2D array of arg names
        const orderArray = uiSpec[modelName].order.flat();
        const orderSet = new Set(orderArray);
        // expect there to be no duplicated args in the order
        expect(orderArray).toHaveLength(orderSet.size);
        orderArray.forEach((arg) => {
          expect(spec.args[arg]).toBeDefined();
        });
      } else {
        // for other properties, each key is an arg
        Object.keys(uiSpec[modelName][property]).forEach((arg) => {
          expect(spec.args[arg]).toBeDefined();
        });
      }
    }
    expect(hasOrderProperty).toBe(true);
  });
});

describe.skip('Build each model UI from ARGS_SPEC', () => {
  const uiSpec = require('../../src/renderer/ui_config');
  // let modelInternalNames;

  // beforeAll(async () => {
  //   const models = await server_requests.getInvestModelNames();
  //   modelInternalNames = Object.keys(models)
  //     .map((key) => models[key].internal_name);
  //   console.log(modelInternalNames)
  // });

  test.each(MODEL_INTERNAL_NAMES)('Build a UI for %s', async (model) => {
    const spec = await server_requests.getSpec(model);

    const { findByLabelText } = render(
      <SetupTab
        pyModuleName={spec.module}
        modelName={spec.modelName}
        argsSpec={spec.args}
        uiSpec={uiSpec}
        argsInitValues={undefined}
        investExecute={() => {}}
        nWorkers="-1"
        sidebarSetupElementId="foo"
        sidebarFooterElementId="foo"
        isRunning={false}
      />
    );
    expect(await findByLabelText('Workspace')).toBeInTheDocument();
  });
});
